// lib/stock-in-record-queries.ts
// Purpose: READ ONLY — query layer for the Stock-In Record view.
// Fetches only STOCK_IN-type StockMovement rows with resolved display names.
// Do not use this file for any mutations.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { CategoryWithRelations } from "@/types";
import { format } from "date-fns";

export interface StockInRecordRow {
  id: string;
  stockInDate: string | null;
  systemDate: string;
  nodeDisplayName: string;
  categoryPath: string;
  branchName: string;
  quantityBefore: number;
  quantityAdded: number;
  quantityAfter: number;
  note: string | null;
  enteredBy: string;
  performedById: string; // Kept for frontend staff access verification
}

export interface GetStockInRecordsParams {
  branchIds: string[];
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

function buildPath(categoryId: string | null, allCategories: CategoryWithRelations[]): string {
  if (!categoryId) return "Uncategorized";
  const path: string[] = [];
  let current = allCategories.find((c) => c.id === categoryId);
  while (current) {
    path.unshift(current.name);
    const parentId = current.parentId;
    current = parentId
      ? allCategories.find((c) => c.id === parentId)
      : undefined;
  }
  return path.join(" › ");
}

export async function getStockInRecords(params: GetStockInRecordsParams): Promise<{
  rows: StockInRecordRow[];
  totalCount: number;
}> {
  const { branchIds, search, dateFrom, dateTo, page, pageSize } = params;

  const dateFilters: Prisma.StockMovementWhereInput[] = [];
  if (dateFrom || dateTo) {
    const stockInDateFilter: Prisma.DateTimeNullableFilter = {};
    const createdAtFilter: Prisma.DateTimeFilter = {};
    if (dateFrom) {
      stockInDateFilter.gte = dateFrom;
      createdAtFilter.gte = dateFrom;
    }
    if (dateTo) {
      stockInDateFilter.lte = dateTo;
      createdAtFilter.lte = dateTo;
    }

    // Date filter uses stockInDate (business date) when available, falling back to createdAt (system date) for older entries that predate this feature.
    // This ensures all historical records remain discoverable by date even before stockInDate was introduced.
    dateFilters.push({
      OR: [
        {
          AND: [
            { stockInDate: { not: null } },
            { stockInDate: stockInDateFilter },
          ],
        },
        {
          AND: [
            { stockInDate: null },
            { createdAt: createdAtFilter },
          ],
        },
      ],
    });
  }

  const searchFilters: Prisma.StockMovementWhereInput[] = [];
  if (search && search.trim()) {
    const s = search.trim();
    searchFilters.push({
      OR: [
        { category: { name: { contains: s, mode: "insensitive" } } },
        { product: { name: { contains: s, mode: "insensitive" } } },
        {
          productVariant: {
            OR: [
              { product: { name: { contains: s, mode: "insensitive" } } },
              { size: { contains: s, mode: "insensitive" } },
              { colour: { contains: s, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }

  const whereClause: Prisma.StockMovementWhereInput = {
    type: "STOCK_IN",
    branchId: { in: branchIds },
    AND: [...dateFilters, ...searchFilters],
  };

  const totalCount = await prisma.stockMovement.count({
    where: whereClause,
  });

  const movements = await prisma.stockMovement.findMany({
    where: whereClause,
    include: {
      branch: { select: { name: true } },
      performedBy: { select: { name: true } },
      category: true,
      product: true,
      productVariant: {
        include: {
          product: true,
        },
      },
    },
    orderBy: [
      { stockInDate: "desc" },
      { createdAt: "desc" },
    ],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  const allCategories = (await prisma.category.findMany()) as CategoryWithRelations[];

  const rows: StockInRecordRow[] = movements.map((m) => {
    let nodeDisplayName = "Unknown Item";
    let categoryPath = "Uncategorized";

    if (m.categoryId && m.category) {
      nodeDisplayName = m.category.name;
      categoryPath = buildPath(m.categoryId, allCategories);
    } else if (m.productId && m.product) {
      nodeDisplayName = m.product.name;
      categoryPath = buildPath(m.product.categoryId, allCategories);
    } else if (m.productVariantId && m.productVariant) {
      const variant = m.productVariant;
      const product = variant.product;
      const variantParts = [variant.colour, variant.size].filter(Boolean).join(" ");
      nodeDisplayName = `${product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();
      categoryPath = buildPath(product.categoryId, allCategories);
    }

    // sign convention: quantityDelta is positive for STOCK_IN, but we use Math.abs to be absolutely certain it's positive.
    const quantityAdded = Math.abs(m.quantityDelta);

    return {
      id: m.id,
      stockInDate: m.stockInDate ? format(m.stockInDate, "dd/MM/yyyy") : null,
      systemDate: format(m.createdAt, "dd/MM/yyyy"),
      nodeDisplayName,
      categoryPath,
      branchName: m.branch.name,
      quantityBefore: m.quantityBefore,
      quantityAdded,
      quantityAfter: m.quantityAfter,
      note: m.note,
      enteredBy: m.performedBy.name ?? "Unknown",
      performedById: m.performedById,
    };
  });

  return { rows, totalCount };
}
