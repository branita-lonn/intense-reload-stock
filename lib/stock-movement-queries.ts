// lib/stock-movement-queries.ts
// Shared read-only query logic for fetching and formatting StockMovement records.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { prisma } from "@/lib/prisma";
import { type StockMovementType } from "@prisma/client";

export interface MovementLogEntry {
  id: string;
  createdAt: Date;
  type: StockMovementType;
  nodeDisplayName: string;
  branchName: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityDelta: number;
  note: string | null;
  performedByName: string;
  linkContext?: {
    kind: "sale" | "stockCount" | "stockTransfer";
    id: string;
  };
}

export async function getMovementLog(params: {
  branchIds: string[];
  type?: StockMovementType;
  performedById?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  categoryId?: string;
  productId?: string;
  productVariantId?: string;
  page: number;
  pageSize: number;
}): Promise<{ entries: MovementLogEntry[]; totalCount: number }> {
  const {
    branchIds,
    type,
    performedById,
    dateFrom,
    dateTo,
    search,
    categoryId,
    productId,
    productVariantId,
    page,
    pageSize,
  } = params;

  // Build filters
  const whereClause: any = {
    branchId: { in: branchIds },
  };

  if (type) {
    whereClause.type = type;
  }

  if (performedById) {
    whereClause.performedById = performedById;
  }

  if (categoryId) {
    whereClause.categoryId = categoryId;
  }

  if (productId) {
    whereClause.productId = productId;
  }

  if (productVariantId) {
    whereClause.productVariantId = productVariantId;
  }

  if (dateFrom || dateTo) {
    whereClause.createdAt = {};
    if (dateFrom) {
      whereClause.createdAt.gte = dateFrom;
    }
    if (dateTo) {
      whereClause.createdAt.lte = dateTo;
    }
  }

  // Fetch count of matching records (before post-resolution search filter)
  const totalCount = await prisma.stockMovement.count({
    where: whereClause,
  });

  // Fetch paginated movement records
  const movements = await prisma.stockMovement.findMany({
    where: whereClause,
    include: {
      branch: {
        select: {
          name: true,
        },
      },
      performedBy: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // Batch-resolution of node display names to prevent N+1 queries.
  // We collect all distinct category, product, and variant IDs from the fetched records,
  // query their respective tables in parallel, and build in-memory maps.
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

  // Map database rows to final MovementLogEntry objects
  let entries: MovementLogEntry[] = movements.map((mv) => {
    let nodeDisplayName = "Unknown Item";
    if (mv.categoryId) {
      nodeDisplayName = categoryMap.get(mv.categoryId) ?? "Unknown Category";
    } else if (mv.productId) {
      nodeDisplayName = productMap.get(mv.productId) ?? "Unknown Product";
    } else if (mv.productVariantId) {
      nodeDisplayName = variantMap.get(mv.productVariantId) ?? "Unknown Variant";
    }

    let linkContext: MovementLogEntry["linkContext"] = undefined;
    if (mv.saleId) {
      linkContext = { kind: "sale", id: mv.saleId };
    } else if (mv.stockCountId) {
      linkContext = { kind: "stockCount", id: mv.stockCountId };
    }

    return {
      id: mv.id,
      createdAt: mv.createdAt,
      type: mv.type,
      nodeDisplayName,
      branchName: mv.branch.name,
      quantityBefore: mv.quantityBefore,
      quantityAfter: mv.quantityAfter,
      quantityDelta: mv.quantityDelta,
      note: mv.note,
      performedByName: mv.performedBy.name,
      linkContext,
    };
  });

  // Apply post-resolution search filter in-memory if provided.
  // Note: Filtering after pagination is a design trade-off to keep queries fast and simple.
  // Since pagination is applied at the database query level, this search filter applies to
  // the current page's results, which may result in fewer than `pageSize` items being returned.
  if (search) {
    const searchLower = search.toLowerCase();
    entries = entries.filter((e) => e.nodeDisplayName.toLowerCase().includes(searchLower));
  }

  return {
    entries,
    totalCount,
  };
}
