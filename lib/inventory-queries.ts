// lib/inventory-queries.ts
// Shared query logic for fetching "current stock" across all three stock-bearing levels in one unified shape.

import { prisma } from "@/lib/prisma";
import { getDescendantIds } from "@/lib/category-tree";
import type { CategoryWithRelations, StockBearingLevel } from "@/types";

export interface InventoryRow {
  nodeType: "CATEGORY" | "PRODUCT" | "VARIANT";
  nodeId: string; // Specific ID for category, product, or productVariant
  displayName: string;
  categoryPath: string;
  categoryId?: string; // Reference to the parent category for easy filtering
  productId?: string; // Reference to the parent product (if product/variant level)
  productVariantId?: string; // Reference to the variant (if variant level)
  branchId: string;
  branchName: string;
  quantity: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  productHasVariants?: boolean; // Helper to show variant actions in the UI
  productDetails?: {
    id: string;
    name: string;
    inventoryRecords: Array<{
      id: string;
      branchId: string;
      quantity: number;
      isReferenceSnapshot: boolean;
      branch: {
        name: string;
      };
    }>;
  };
}

/**
 * Helper to build breadcrumb style path for a category.
 */
function buildPath(categoryId: string, allCategories: CategoryWithRelations[]): string {
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

/**
 * This function is the single source of truth for 'what does the owner currently have in stock, regardless of tracking granularity.'
 * Future stages (low-stock alerts, analytics, sale logging) should query through here rather than querying `Inventory` directly,
 * to avoid re-deriving the polymorphic join logic repeatedly.
 */
export async function getInventoryRows(params: {
  branchIds: string[];
  categoryId?: string;
  categoryIds?: string[];
  search?: string;
}): Promise<InventoryRow[]> {
  const { branchIds, categoryId, categoryIds, search } = params;

  // 1. Fetch active inventory records for the specified branch(es)
  const inventoryRecords = await prisma.inventory.findMany({
    where: {
      branchId: { in: branchIds },
      isReferenceSnapshot: false,
    },
    include: {
      branch: {
        select: {
          name: true,
        },
      },
      category: true,
      product: {
        include: {
          variants: {
            select: {
              id: true,
            },
          },
          inventoryRecords: {
            include: {
              branch: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      productVariant: {
        include: {
          product: {
            include: {
              category: true,
            },
          },
        },
      },
    },
  });

  // 2. Fetch all categories to compute hierarchical paths
  const allCategories = (await prisma.category.findMany()) as CategoryWithRelations[];

  // 3. Map polymorphic records to unified InventoryRow structure
  let rows: InventoryRow[] = [];

  for (const inv of inventoryRecords) {
    if (inv.categoryId && inv.category) {
      // Category level
      rows.push({
        nodeType: "CATEGORY",
        nodeId: inv.categoryId,
        displayName: inv.category.name,
        categoryPath: buildPath(inv.categoryId, allCategories),
        categoryId: inv.categoryId,
        branchId: inv.branchId,
        branchName: inv.branch.name,
        quantity: inv.quantity,
        lowStockThreshold: inv.lowStockThreshold,
        isLowStock: inv.quantity <= inv.lowStockThreshold,
      });
    } else if (inv.productId && inv.product) {
      // Product level
      rows.push({
        nodeType: "PRODUCT",
        nodeId: inv.productId,
        displayName: inv.product.name,
        categoryPath: buildPath(inv.product.categoryId, allCategories),
        categoryId: inv.product.categoryId,
        productId: inv.productId,
        branchId: inv.branchId,
        branchName: inv.branch.name,
        quantity: inv.quantity,
        lowStockThreshold: inv.lowStockThreshold,
        isLowStock: inv.quantity <= inv.lowStockThreshold,
        productHasVariants: inv.product.variants.length > 0,
        productDetails: {
          id: inv.product.id,
          name: inv.product.name,
          inventoryRecords: inv.product.inventoryRecords,
        },
      });
    } else if (inv.productVariantId && inv.productVariant) {
      // Variant level
      const variant = inv.productVariant;
      const product = variant.product;
      const variantParts = [variant.colour, variant.size].filter(Boolean).join(" ");
      const displayName = `${product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();

      rows.push({
        nodeType: "VARIANT",
        nodeId: inv.productVariantId,
        displayName,
        categoryPath: buildPath(product.categoryId, allCategories),
        categoryId: product.categoryId,
        productId: product.id,
        productVariantId: inv.productVariantId,
        branchId: inv.branchId,
        branchName: inv.branch.name,
        quantity: inv.quantity,
        lowStockThreshold: inv.lowStockThreshold,
        isLowStock: inv.quantity <= inv.lowStockThreshold,
      });
    }
  }

  // 4. Filter by Category Hierarchy if specified
  if (categoryId) {
    const descendantIds = [categoryId, ...getDescendantIds(categoryId, allCategories)];
    rows = rows.filter((r) => r.categoryId && descendantIds.includes(r.categoryId));
  } else if (categoryIds && categoryIds.length > 0) {
    const allDescendantIds: string[] = [];
    for (const catId of categoryIds) {
      allDescendantIds.push(catId, ...getDescendantIds(catId, allCategories));
    }
    rows = rows.filter((r) => r.categoryId && allDescendantIds.includes(r.categoryId));
  }

  // 5. Filter by Search Query if specified
  if (search) {
    const searchLower = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.displayName.toLowerCase().includes(searchLower) ||
        r.categoryPath.toLowerCase().includes(searchLower)
    );
  }

  return rows;
}

export interface InventoryNodeRef {
  categoryId?: string | null;
  productId?: string | null;
  productVariantId?: string | null;
}

/**
 * Resolves a human-readable display name for any given stock-bearing node reference.
 * Used for displaying items in sale records and API logs.
 */
export async function resolveNodeDisplayName(node: InventoryNodeRef): Promise<string> {
  if (node.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: node.categoryId },
      select: { name: true },
    });
    return category?.name ?? "Unknown Category";
  }

  if (node.productId) {
    const product = await prisma.product.findUnique({
      where: { id: node.productId },
      select: { name: true },
    });
    return product?.name ?? "Unknown Product";
  }

  if (node.productVariantId) {
    const variant = await prisma.productVariant.findUnique({
      where: { id: node.productVariantId },
      include: {
        product: {
          select: { name: true },
        },
      },
    });
    if (!variant) return "Unknown Variant";
    const variantParts = [variant.colour, variant.size].filter(Boolean).join(" ");
    return `${variant.product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();
  }

  return "Unknown Item";
}
