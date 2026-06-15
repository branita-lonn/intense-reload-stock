// types/index.ts
// Shared TypeScript interfaces and union types used across the dashboard from Stage 4 forward.

import type { Category, Inventory, Product, ProductVariant } from "@prisma/client";

// ---------------------------------------------------------------------------
// StockBearingLevel
// ---------------------------------------------------------------------------
// Describes where a given product's stock currently lives in the granularity
// tree: category-level, product-level, variant-level, or not yet configured.
// Computed by getProductStockBearingLevel() in lib/category-tree.ts and
// carried on API responses so clients never re-derive it independently.
export type StockBearingLevel = "CATEGORY" | "PRODUCT" | "VARIANT" | "NONE";

// ---------------------------------------------------------------------------
// InventoryNodeRef
// ---------------------------------------------------------------------------
// A typed shorthand for "the polymorphic Inventory parent reference".
// Exactly one of the three optional fields must be set at runtime —
// enforced at the application layer by assertExactlyOneStockParent
// (lib/validations/inventory.ts) and at the DB layer by unique constraints.
export interface InventoryNodeRef {
  categoryId?: string;
  productId?: string;
  productVariantId?: string;
}

// ---------------------------------------------------------------------------
// CategoryWithRelations
// ---------------------------------------------------------------------------
// Extends the Prisma Category model with optional relations used across the
// category management and product dashboards.
export interface CategoryWithRelations extends Category {
  parent?: Category | null;
  children?: CategoryWithRelations[];
  _count?: {
    products: number;
  };
}

// ---------------------------------------------------------------------------
// VariantWithRelations
// ---------------------------------------------------------------------------
// ProductVariant with its current-stock Inventory records.
// Note: inventoryRecords here contains ALL records including snapshots —
// callers that want only current-stock data should filter
// isReferenceSnapshot === false before aggregating quantities.
export interface VariantWithRelations extends ProductVariant {
  inventoryRecords: Inventory[];
}

// ---------------------------------------------------------------------------
// ProductWithRelations
// ---------------------------------------------------------------------------
// Product with category, variants, and inventory records.
//
// Filtering convention for inventoryRecords:
//   When this type is used in "current stock" contexts (inventory dashboard,
//   product list stock column), inventoryRecords is pre-filtered to exclude
//   isReferenceSnapshot === true rows.  This is done at the query layer, not
//   here, so the type itself is permissive — see the comment at each query
//   site for the explicit filter applied.
//
// When this type is used in the edit-form context (GET /api/dashboard/products/[id]),
// ALL Inventory rows INCLUDING snapshots are included so the form can show
// historical context. The query site documents this explicitly.
export interface ProductWithRelations extends Product {
  category: Category;
  variants: VariantWithRelations[];
  inventoryRecords: Inventory[];
  // Computed server-side via getProductStockBearingLevel(); present on API
  // responses but not on raw Prisma objects.
  stockBearingLevel?: StockBearingLevel;
}

// ---------------------------------------------------------------------------
// VariantInput
// ---------------------------------------------------------------------------
// Shape of a single variant's data as it flows from the product form to the
// API before submission. id is present when updating an existing variant,
// absent when creating a new one.
export interface VariantInput {
  id?: string;
  sku?: string;
  size?: string;
  colour?: string;
  brand?: string;
  costPrice?: number;
  sellingPrice?: number;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// ProductFormValues
// ---------------------------------------------------------------------------
// Zod-inferred type for the product form (ProductForm, Stage 4 Commit 3).
// Declared here so server-side validation schemas and client-side form
// schemas share a single source of truth.
// The full Zod schema is defined in lib/validations/product.ts.
export interface ProductFormValues {
  name: string;
  description?: string;
  brand?: string;
  tags: string[];
  categoryId: string;
  isActive: boolean;
  images: string[];
  variants?: VariantInput[];
}
