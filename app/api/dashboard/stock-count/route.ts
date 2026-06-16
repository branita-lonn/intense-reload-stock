// app/api/dashboard/stock-count/route.ts
// API endpoints for listing past stock counts and initiating new stock count sessions

import { requireSession, requireBranchAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { handleApiError, ValidationError } from "@/lib/errors";
import { startStockCountSchema } from "@/lib/validations/stock-count";
import { getInventoryRows, resolveNodeDisplayName } from "@/lib/inventory-queries";
import type { StockCountStatus } from "@prisma/client";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const status = searchParams.get("status") || undefined;

    if (!branchId) {
      throw new ValidationError("Branch ID is required");
    }

    // Enforce OWASP A01: Broken Access Control
    await requireBranchAccess(session.user.id, branchId);

    const counts = await prisma.stockCount.findMany({
      where: {
        branchId,
        ...(status ? { status: status as StockCountStatus } : {}),
      },
      include: {
        startedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        completedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          select: {
            id: true,
            expectedQty: true,
            countedQty: true,
            variance: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedCounts = counts.map((count) => {
      let totalVariance = 0;
      if (count.status === "COMPLETED") {
        totalVariance = count.items.reduce((sum, item) => sum + Math.abs(item.variance ?? 0), 0);
      }
      return {
        id: count.id,
        branchId: count.branchId,
        status: count.status,
        scope: count.scope,
        scopeCategoryIds: count.scopeCategoryIds,
        scopeProductId: count.scopeProductId,
        startedById: count.startedById,
        completedById: count.completedById,
        startedAt: count.startedAt,
        completedAt: count.completedAt,
        createdAt: count.createdAt,
        updatedAt: count.updatedAt,
        startedBy: count.startedBy,
        completedBy: count.completedBy,
        itemCount: count.items.length,
        totalVariance,
      };
    });

    return Response.json(formattedCounts);
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    const body = await request.json();

    const parsed = startStockCountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid parameters for starting stock count", parsed.error);
    }

    const { branchId, scope, scopeCategoryIds, scopeProductId } = parsed.data;

    // Enforce OWASP A01: Broken Access Control
    await requireBranchAccess(session.user.id, branchId);

    // Prevent concurrent active sessions of the same scope on this branch
    const existing = await prisma.stockCount.findFirst({
      where: {
        branchId,
        scope,
        status: "IN_PROGRESS",
      },
    });

    if (existing) {
      return Response.json(
        {
          error: "A stock count is already in progress for this branch. Complete or review it first.",
          existingId: existing.id,
        },
        { status: 400 }
      );
    }

    // Determine relevant nodes to snapshot
    let itemsToCreate: Array<{
      categoryId?: string;
      productId?: string;
      productVariantId?: string;
      expectedQty: number;
    }> = [];

    if (scope === "FULL_BRANCH") {
      const rows = await getInventoryRows({ branchIds: [branchId] });
      itemsToCreate = rows.map((r) => ({
        categoryId: r.nodeType === "CATEGORY" ? r.nodeId : undefined,
        productId: r.nodeType === "PRODUCT" ? r.nodeId : undefined,
        productVariantId: r.nodeType === "VARIANT" ? r.nodeId : undefined,
        expectedQty: r.quantity,
      }));
    } else if (scope === "DRILL_DOWN_MIGRATION") {
      const rows = await getInventoryRows({
        branchIds: [branchId],
        categoryIds: scopeCategoryIds,
      });
      itemsToCreate = rows.map((r) => ({
        categoryId: r.nodeType === "CATEGORY" ? r.nodeId : undefined,
        productId: r.nodeType === "PRODUCT" ? r.nodeId : undefined,
        productVariantId: r.nodeType === "VARIANT" ? r.nodeId : undefined,
        expectedQty: r.quantity,
      }));
    } else if (scope === "VARIANT_CONVERSION_MIGRATION") {
      if (!scopeProductId) {
        throw new ValidationError("Product ID is required for variant conversion scope");
      }
      const variants = await prisma.productVariant.findMany({
        where: { productId: scopeProductId, isActive: true },
      });

      const inventoryRecords = await prisma.inventory.findMany({
        where: {
          branchId,
          productVariantId: { in: variants.map((v) => v.id) },
          isReferenceSnapshot: false,
        },
      });

      itemsToCreate = variants.map((v) => {
        const inv = inventoryRecords.find((i) => i.productVariantId === v.id);
        return {
          productVariantId: v.id,
          expectedQty: inv ? inv.quantity : 0,
        };
      });
    }

    // Create stock count session and items in transaction
    const stockCount = await prisma.$transaction(async (tx) => {
      const sc = await tx.stockCount.create({
        data: {
          branchId,
          status: "IN_PROGRESS",
          scope,
          scopeCategoryIds: scopeCategoryIds || [],
          scopeProductId: scopeProductId || null,
          startedById: session.user.id,
        },
      });

      if (itemsToCreate.length > 0) {
        await tx.stockCountItem.createMany({
          data: itemsToCreate.map((item) => ({
            stockCountId: sc.id,
            categoryId: item.categoryId || null,
            productId: item.productId || null,
            productVariantId: item.productVariantId || null,
            expectedQty: item.expectedQty,
          })),
        });
      }

      return sc;
    });

    // Fetch and return with resolved display names
    const createdWithItems = await prisma.stockCount.findUnique({
      where: { id: stockCount.id },
      include: {
        items: true,
        startedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!createdWithItems) {
      throw new Error("Failed to retrieve newly created stock count");
    }

    const itemsWithDisplayNames = await Promise.all(
      createdWithItems.items.map(async (item) => {
        const displayName = await resolveNodeDisplayName({
          categoryId: item.categoryId,
          productId: item.productId,
          productVariantId: item.productVariantId,
        });
        return {
          ...item,
          displayName,
        };
      })
    );

    return Response.json({
      ...createdWithItems,
      items: itemsWithDisplayNames,
    });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
