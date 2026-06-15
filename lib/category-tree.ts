// lib/category-tree.ts
// Pure utility functions for converting a flat list of categories into a nested tree and validating stock-bearing hierarchy.

import { type Category } from "@prisma/client";

export interface CategoryWithRelations extends Category {
  parent?: Category | null;
  children?: CategoryWithRelations[];
  _count?: {
    products: number;
  };
}

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
