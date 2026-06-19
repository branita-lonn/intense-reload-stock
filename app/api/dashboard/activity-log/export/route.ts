// app/api/dashboard/activity-log/export/route.ts
// Export route generating CSV files in-memory for stock movement activity logs.
// Generated entirely in-memory from query results; no filesystem access, preventing path traversal (OWASP A01/A05 adjacent concern for export features).
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { type NextRequest } from "next/server";
import { requireSession, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { StockMovementType } from "@prisma/client";

export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireSession();

    const { searchParams } = new URL(request.url);
    const branchIdParam = searchParams.get("branchId") || undefined;
    const typeParam = searchParams.get("type") || undefined;
    const performedByIdParam = searchParams.get("performedById") || undefined;
    const dateFromParam = searchParams.get("dateFrom") || undefined;
    const dateToParam = searchParams.get("dateTo") || undefined;
    const searchParam = searchParams.get("search") || undefined;

    // 1. Resolve branch access
    let finalBranchIds: string[] = [];
    if (branchIdParam) {
      await requireBranchAccess(session.user.id, branchIdParam);
      finalBranchIds = [branchIdParam];
    } else {
      finalBranchIds = await getAccessibleBranchIds(session);
    }

    // 2. Enforce role-scoped performer filter
    let finalPerformedById: string | undefined = undefined;
    if (session.user.role === "STAFF") {
      finalPerformedById = session.user.id;
    } else {
      if (performedByIdParam) {
        finalPerformedById = performedByIdParam;
      }
    }

    // 3. Build query filters
    const whereClause: any = {
      branchId: { in: finalBranchIds },
    };

    if (typeParam) {
      if (Object.values(StockMovementType).includes(typeParam as StockMovementType)) {
        whereClause.type = typeParam as StockMovementType;
      } else {
        throw new ValidationError("Invalid stock movement type.");
      }
    }

    if (finalPerformedById) {
      whereClause.performedById = finalPerformedById;
    }

    if (dateFromParam || dateToParam) {
      whereClause.createdAt = {};
      if (dateFromParam) {
        const dateFrom = new Date(dateFromParam);
        if (isNaN(dateFrom.getTime())) throw new ValidationError("Invalid dateFrom.");
        whereClause.createdAt.gte = dateFrom;
      }
      if (dateToParam) {
        const dateTo = new Date(dateToParam);
        if (isNaN(dateTo.getTime())) throw new ValidationError("Invalid dateTo.");
        whereClause.createdAt.lte = dateTo;
      }
    }

    // 4. Enforce export row limit (upper bound 10,000 rows to prevent resource exhaustion / DoS)
    const totalCount = await prisma.stockMovement.count({
      where: whereClause,
    });

    if (totalCount > 10000) {
      throw new ValidationError("Too many rows to export — narrow your date range or filters.");
    }

    // 5. Fetch all matching movements
    const movements = await prisma.stockMovement.findMany({
      where: whereClause,
      include: {
        branch: {
          select: { name: true },
        },
        performedBy: {
          select: { name: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // 6. Batch resolution of node display names to prevent N+1 queries
    const categoryIds = new Set<string>();
    const productIds = new Set<string>();
    const productVariantIds = new Set<string>();

    for (const mv of movements) {
      if (mv.categoryId) categoryIds.add(mv.categoryId);
      if (mv.productId) productIds.add(mv.productId);
      if (mv.productVariantId) productVariantIds.add(mv.productVariantId);
    }

    const [categories, products, variants] = await Promise.all([
      categoryIds.size > 0
        ? prisma.category.findMany({
            where: { id: { in: Array.from(categoryIds) } },
            select: { id: true, name: true },
          })
        : [],
      productIds.size > 0
        ? prisma.product.findMany({
            where: { id: { in: Array.from(productIds) } },
            select: { id: true, name: true },
          })
        : [],
      productVariantIds.size > 0
        ? prisma.productVariant.findMany({
            where: { id: { in: Array.from(productVariantIds) } },
            include: {
              product: {
                select: { name: true },
              },
            },
          })
        : [],
    ]);

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const productMap = new Map(products.map((p) => [p.id, p.name]));
    const variantMap = new Map(
      variants.map((v) => {
        const variantParts = [v.colour, v.size].filter(Boolean).join(" ");
        const displayName = `${v.product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();
        return [v.id, displayName];
      })
    );

    // 7. Format entries and apply search query if present
    let entries = movements.map((mv) => {
      let nodeDisplayName = "Unknown Item";
      if (mv.categoryId) {
        nodeDisplayName = categoryMap.get(mv.categoryId) ?? "Unknown Category";
      } else if (mv.productId) {
        nodeDisplayName = productMap.get(mv.productId) ?? "Unknown Product";
      } else if (mv.productVariantId) {
        nodeDisplayName = variantMap.get(mv.productVariantId) ?? "Unknown Variant";
      }

      return {
        createdAt: mv.createdAt,
        type: mv.type,
        nodeDisplayName,
        branchName: mv.branch.name,
        quantityBefore: mv.quantityBefore,
        quantityAfter: mv.quantityAfter,
        quantityDelta: mv.quantityDelta,
        note: mv.note ?? "",
        performedByName: mv.performedBy.name,
      };
    });

    if (searchParam) {
      const searchLower = searchParam.toLowerCase();
      entries = entries.filter((e) => e.nodeDisplayName.toLowerCase().includes(searchLower));
    }

    // 8. Generate CSV in-memory
    const csvHeaders = ["Date/Time", "Type", "Item", "Branch", "Before", "After", "Delta", "Note", "Performed By"];
    
    // Escape helper for CSV fields
    const escapeCsv = (str: string) => {
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvRows = entries.map((e) => [
      e.createdAt.toISOString(),
      e.type,
      escapeCsv(e.nodeDisplayName),
      escapeCsv(e.branchName),
      e.quantityBefore.toString(),
      e.quantityAfter.toString(),
      (e.quantityDelta > 0 ? "+" : "") + e.quantityDelta.toString(),
      escapeCsv(e.note),
      escapeCsv(e.performedByName),
    ]);

    const csvContent = [csvHeaders.join(","), ...csvRows.map((row) => row.join(","))].join("\n");
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="activity-log-${dateStr}.csv"`,
      },
    });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
