// lib/category-tree.ts
// Pure utility functions for converting a flat list of categories into a nested tree and validating stock-bearing hierarchy.
// Extended in Stage 4 to cover product-level granularity checks.

import type { CategoryWithRelations, ProductWithRelations, StockBearingLevel } from "@/types";

// CategoryWithRelations is now the canonical type defined in types/index.ts and re-exported below
// for backwards compatibility with Stage 3 imports.
export type { CategoryWithRelations } from "@/types";

export interface CategoryTreeNode extends CategoryWithRelations {
  children: CategoryTreeNode[];
}

/**
 * Converts a flat array of categories into a nested tree structure.
 * Respects the sortOrder of categories.
 */
export function buildCategoryTree(categories: CategoryWithRelations[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];

  // Sort first to ensure order is preserved during tree insertion
  const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);

  // Initialize tree nodes map
  for (const cat of sorted) {
    map.set(cat.id, { ...cat, children: [] });
  }

  // Populate children arrays and extract root nodes
  for (const cat of sorted) {
    const node = map.get(cat.id);
    if (!node) continue;

    if (cat.parentId && map.has(cat.parentId)) {
      const parentNode = map.get(cat.parentId);
      if (parentNode) {
        parentNode.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Recursively retrieves all descendant category IDs for a given category.
 */
export function getDescendantIds(categoryId: string, allCategories: CategoryWithRelations[]): string[] {
  const descendants: string[] = [];

  const traverse = (id: string) => {
    for (const cat of allCategories) {
      if (cat.parentId === id) {
        descendants.push(cat.id);
        traverse(cat.id);
      }
    }
  };

  traverse(categoryId);
  return descendants;
}

/**
 * Retrieves all ancestor category IDs up to the root for a given category.
 */
export function getAncestorIds(categoryId: string, allCategories: CategoryWithRelations[]): string[] {
  const ancestors: string[] = [];
  let currentId = categoryId;

  while (true) {
    const current = allCategories.find((c) => c.id === currentId);
    if (current && current.parentId) {
      ancestors.push(current.parentId);
      currentId = current.parentId;
    } else {
      break;
    }
  }

  return ancestors;
}

/**
 * Checks if any descendant of the given category is currently marked as stock-bearing.
 */
export function hasStockBearingDescendant(categoryId: string, allCategories: CategoryWithRelations[]): boolean {
  const descendantIds = getDescendantIds(categoryId, allCategories);
  return allCategories.some((c) => descendantIds.includes(c.id) && c.isStockBearing);
}

/**
 * Checks if any ancestor of the given category is currently marked as stock-bearing.
 */
export function hasStockBearingAncestor(categoryId: string, allCategories: CategoryWithRelations[]): boolean {
  const ancestorIds = getAncestorIds(categoryId, allCategories);
  return allCategories.some((c) => ancestorIds.includes(c.id) && c.isStockBearing);
}

// ---------------------------------------------------------------------------
// Stage 4 — Product-level granularity helpers
// ---------------------------------------------------------------------------

/**
 * Determines where a product's stock currently lives in the granularity tree.
 *
 * Returns:
 *   "CATEGORY" — the product's parent category is isStockBearing: true;
 *                the product exists only as a catalogue entry, no own stock.
 *   "VARIANT"  — the product has one or more ProductVariant rows;
 *                each variant owns its own Inventory row per branch.
 *   "PRODUCT"  — the product itself is isStockBearing: true with no variants;
 *                one Inventory row per branch for the product as a whole.
 *   "NONE"     — none of the above; an unconfigured state (e.g. a newly
 *                created product before the owner chooses a tracking setup).
 *                The UI must handle this gracefully (warn, don't crash).
 */
export function getProductStockBearingLevel(
  product: ProductWithRelations,
  _categories: CategoryWithRelations[]
): StockBearingLevel {
  // Category-level takes precedence — the product is purely a catalogue entry.
  if (product.category.isStockBearing) return "CATEGORY";
  // Variant-level — variants are the stock-bearing nodes.
  if (product.variants.length > 0) return "VARIANT";
  // Product-level — the product itself holds stock.
  if (product.isStockBearing) return "PRODUCT";
  // Unconfigured.
  return "NONE";
}

/**
 * Returns whether this product is eligible to become isStockBearing: true.
 *
 * A product CANNOT be stock-bearing if:
 *   (a) Its parent category is already isStockBearing (ancestor conflict).
 *   (b) It already has ProductVariant rows (descendant conflict — variants
 *       are always implicitly stock-bearing, so product + variants = conflict).
 *
 * Used both server-side (stock-bearing toggle endpoint, Stage 4 Commit 2d)
 * and client-side (ProductForm Step 2, for immediate UI feedback before
 * server validation).
 */
export function canProductBeStockBearing(
  product: ProductWithRelations,
  _categories: CategoryWithRelations[]
): { allowed: boolean; reason?: string } {
  if (product.category.isStockBearing) {
    return {
      allowed: false,
      reason: `Stock for products in "${product.category.name}" is tracked at the category level. This product cannot have its own stock entry.`,
    };
  }
  if (product.variants.length > 0) {
    return {
      allowed: false,
      reason:
        "This product already has variants. Each variant is independently stock-bearing — the product itself cannot also be stock-bearing.",
    };
  }
  return { allowed: true };
}

/**
 * Returns whether ProductVariant rows can be added to this product.
 *
 * Variants CANNOT be added if:
 *   (a) The parent category is isStockBearing (ancestor conflict — category
 *       is the single source of truth, variants would create a conflict).
 *   (b) The product is currently isStockBearing: true AND has non-zero,
 *       non-snapshot Inventory rows — the owner must go through the
 *       "convert to variant tracking" flow (Task 4) instead, which
 *       creates reference snapshots of the current product-level stock
 *       before switching to variant-level tracking.
 *
 * Note: if the product is isStockBearing: true but ALL Inventory rows are
 * zero-quantity or isReferenceSnapshot: true, direct variant addition is
 * still blocked here because the convert flow is the canonical UX path —
 * it ensures the owner consciously snapshots and reassigns stock rather
 * than silently losing the product-level record.
 */
export function canVariantsBeAddedToProduct(
  product: ProductWithRelations,
  _categories: CategoryWithRelations[]
): { allowed: boolean; reason?: string } {
  if (product.category.isStockBearing) {
    return {
      allowed: false,
      reason: `Stock for products in "${product.category.name}" is tracked at the category level. Variants cannot be added to products in a stock-bearing category.`,
    };
  }
  if (product.isStockBearing) {
    return {
      allowed: false,
      reason:
        'This product currently tracks its own stock. Use "Track by variant" from the inventory dashboard to convert to variant-level tracking first — this will safely snapshot the current stock quantities before creating variant entries.',
    };
  }
  return { allowed: true };
}
