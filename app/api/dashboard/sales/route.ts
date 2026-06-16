// app/api/dashboard/sales/route.ts
// API route for querying sales (GET) and submitting counter sales (POST).
// Enforces role-based filters, per-user rate limiting, branch access check, and transactional inventory decrements.

import { type NextRequest } from "next/server";
import { requireSession, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError, RateLimitError } from "@/lib/errors";
import { logSaleSchema } from "@/lib/validations/sale";
import { checkSalesRateLimit } from "@/lib/rate-limit";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";
import { prisma } from "@/lib/prisma";
import { SaleStatus } from "@prisma/client";

/**
 * GET /api/dashboard/sales
 * Fetches sales history with filters.
 * STAFF: restricted server-side to viewing only their own logged sales.
 * OWNER/BRANCH_MANAGER: can view any sales within their accessible branches.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId") || undefined;
    const statusParam = searchParams.get("status") || undefined;
    const loggedByIdParam = searchParams.get("loggedById") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;

    // 1. Determine accessible branches
    let finalBranchIds: string[] = [];
    if (branchIdParam) {
      await requireBranchAccess(session.user.id, branchIdParam);
      finalBranchIds = [branchIdParam];
    } else {
      finalBranchIds = await getAccessibleBranchIds(session);
    }

    // 2. Enforce role-scoped creator filter
    let finalLoggedById: string | undefined = undefined;
    if (session.user.role === "STAFF") {
      // Staff can only ever query their own logged sales
      finalLoggedById = session.user.id;
    } else {
      // Owner and Manager can filter by staff if specified
      if (loggedByIdParam) {
        finalLoggedById = loggedByIdParam;
      }
    }

    // 3. Status filter validation
    let statusFilter: SaleStatus | undefined = undefined;
    if (statusParam) {
      if (Object.values(SaleStatus).includes(statusParam as SaleStatus)) {
        statusFilter = statusParam as SaleStatus;
      }
    }

    // 4. Build query filters
    const whereClause: any = {
      branchId: { in: finalBranchIds },
      status: statusFilter,
      loggedById: finalLoggedById,
    };

    if (dateFromParam || dateToParam) {
      whereClause.createdAt = {};
      if (dateFromParam) {
        whereClause.createdAt.gte = new Date(dateFromParam);
      }
      if (dateToParam) {
        whereClause.createdAt.lte = new Date(dateToParam);
      }
    }

    // 5. Fetch sales
    const sales = await prisma.sale.findMany({
      where: whereClause,
      include: {
        items: true,
        loggedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 6. Resolve display names for each sale item in parallel
    const resolvedSales = await Promise.all(
      sales.map(async (sale) => {
        const itemsWithNames = await Promise.all(
          sale.items.map(async (item) => {
            const displayName = await resolveNodeDisplayName(item);
            return {
              ...item,
              displayName,
            };
          })
        );
        return {
          ...sale,
          items: itemsWithNames,
        };
      })
    );

    return Response.json(resolvedSales, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

/**
 * POST /api/dashboard/sales
 * Submits a new sale (basket of items). Decrements Inventory immediately.
 * Enforces rate limiting, branch access, and performs transactional updates.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();

    // 1. Validate request body
    const body = (await request.json()) as unknown;
    const parsed = logSaleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid sale data.", parsed.error);
    }

    const { branchId, items } = parsed.data;

    // 2. Enforce per-user rate limit (30 sales per 5 minutes)
    const rateLimit = await checkSalesRateLimit(session.user.id);
    if (!rateLimit.success) {
      throw new RateLimitError(
        "You're logging sales very quickly — please wait a moment and try again."
      );
    }

    // 3. Enforce branch access check
    await requireBranchAccess(session.user.id, branchId);

    // 4. Fetch StoreSettings for requireSaleApproval global flag
    const settings = await prisma.storeSettings.findFirst({
      select: { requireSaleApproval: true },
    });
    const requireApproval = settings?.requireSaleApproval ?? true;

    // 5. Execute transactional updates
    const result = await prisma.$transaction(async (tx) => {
      const oversoldItems: { name: string; newQuantity: number }[] = [];

      // Validate & update inventory first to prevent any partial state mutations
      const inventoryUpdates = [];
      for (const item of items) {
        // Build polymorphic WHERE clause
        const invWhere: any = {
          branchId,
          isReferenceSnapshot: false,
        };
        if (item.categoryId) {
          invWhere.categoryId = item.categoryId;
        } else if (item.productId) {
          invWhere.productId = item.productId;
        } else {
          invWhere.productVariantId = item.productVariantId;
        }

        const currentInv = await tx.inventory.findFirst({
          where: invWhere,
        });

        if (!currentInv) {
          throw new NotFoundError(
            "This item is no longer tracked. It may have been reconfigured — refresh and try again."
          );
        }

        const quantityBefore = currentInv.quantity;
        const quantityAfter = quantityBefore - item.quantity;

        // Collect updates to perform
        inventoryUpdates.push({
          id: currentInv.id,
          quantityBefore,
          quantityAfter,
          item,
        });

        if (quantityAfter < 0) {
          // Resolve name for the oversold reporting
          const name = await resolveNodeDisplayName(item);
          oversoldItems.push({ name, newQuantity: quantityAfter });
        }
      }

      // Create Sale parent record
      const sale = await tx.sale.create({
        data: {
          branchId,
          status: requireApproval ? SaleStatus.PENDING : SaleStatus.APPROVED,
          loggedById: session.user.id,
        },
      });

      // Execute inventory decrements, create SaleItems, and create StockMovements
      for (const update of inventoryUpdates) {
        await tx.inventory.update({
          where: { id: update.id },
          data: { quantity: update.quantityAfter },
        });

        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            categoryId: update.item.categoryId ?? null,
            productId: update.item.productId ?? null,
            productVariantId: update.item.productVariantId ?? null,
            quantity: update.item.quantity,
          },
        });

        await tx.stockMovement.create({
          data: {
            branchId,
            categoryId: update.item.categoryId ?? null,
            productId: update.item.productId ?? null,
            productVariantId: update.item.productVariantId ?? null,
            type: "SALE",
            quantityBefore: update.quantityBefore,
            quantityAfter: update.quantityAfter,
            quantityDelta: -update.item.quantity,
            saleId: sale.id,
            performedById: session.user.id,
          },
        });
      }

      return { sale, oversoldItems };
    });

    // 6. Build resolved item response for output
    const resolvedItems = await Promise.all(
      result.sale.id
        ? await prisma.saleItem
            .findMany({ where: { saleId: result.sale.id } })
            .then((items) =>
              Promise.all(
                items.map(async (item) => ({
                  ...item,
                  displayName: await resolveNodeDisplayName(item),
                }))
              )
            )
        : []
    );

    return Response.json(
      {
        ...result.sale,
        items: resolvedItems,
        oversoldItems: result.oversoldItems,
        wasOversold: result.oversoldItems.length > 0,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
