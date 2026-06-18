// lib/validations/sale.ts
// Zod schemas for the Log Sale (stock-out) flow — validates both the per-item input and the full sale submission body.

import { z } from "zod";
import { assertExactlyOneStockParent } from "./inventory";

/**
 * Schema for a single child-item in a Stage 15 sale breakdown.
 * Polymorphic — exactly one of categoryId/productId/productVariantId must be set.
 * Breakdown items are annotation-only: they do NOT affect Inventory.
 */
export const breakdownItemSchema = z
  .object({
    categoryId: z.string().nullable().optional(),
    productId: z.string().nullable().optional(),
    productVariantId: z.string().nullable().optional(),
    quantity: z
      .number()
      .int("Breakdown quantity must be a whole number.")
      .positive("Breakdown quantity must be at least 1."),
  })
  .superRefine((data, ctx) => {
    try {
      assertExactlyOneStockParent(data);
    } catch (err: unknown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          err instanceof Error
            ? err.message
            : "Each breakdown item must target exactly one node: Category, Product, or Variant.",
        path: ["categoryId"],
      });
    }
  });

export type BreakdownItem = z.infer<typeof breakdownItemSchema>;

/**
 * Schema for a single line item in a sale submission.
 *
 * Polymorphic node reference: exactly one of categoryId, productId, or
 * productVariantId must be set — enforced by assertExactlyOneStockParent,
 * the same helper used by Inventory and SaleItem (three models total).
 *
 * Quantity ceiling:
 * 1000 units of any single product in one sale is far beyond plausible retail
 * activity for this business. This bound exists to catch data-entry errors and
 * abuse (e.g. a buggy or compromised client submitting runaway quantities),
 * not to constrain legitimate use. The limit is surfaced as a friendly inline
 * validation message — it is NOT a silent cap.
 *
 * Stage 15: Optional `breakdown` array (annotation-only). When provided, the
 * sum of breakdown quantities must equal the parent item quantity (.refine).
 */
export const saleItemInputSchema = z
  .object({
    categoryId: z.string().nullable().optional(),
    productId: z.string().nullable().optional(),
    productVariantId: z.string().nullable().optional(),
    quantity: z
      .number()
      .int("Quantity must be a whole number.")
      .positive("Quantity must be at least 1.")
      .max(
        1000,
        "Quantity cannot exceed 1,000 units per item. Please double-check your entry."
      ),
    // Stage 15: annotation-only breakdown. Only valid for category-level nodes.
    breakdown: z.array(breakdownItemSchema).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    try {
      assertExactlyOneStockParent(data);
    } catch (err: unknown) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          err instanceof Error
            ? err.message
            : "Each sale item must target exactly one stock level: Category, Product, or Variant.",
        path: ["categoryId"],
      });
    }

    // Validate breakdown sum equals parent quantity when breakdown is provided.
    if (data.breakdown && data.breakdown.length > 0) {
      const breakdownTotal = data.breakdown.reduce((sum, b) => sum + b.quantity, 0);
      if (breakdownTotal !== data.quantity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Breakdown quantities must sum to the parent quantity (${data.quantity}). Got ${breakdownTotal}.`,
          path: ["breakdown"],
        });
      }
    }
  });

export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

/**
 * Schema for the full POST /api/dashboard/sales request body.
 *
 * A single "sale" transaction covers up to 20 distinct line items — generous
 * for a retail counter scenario. The 1-item minimum enforces that the endpoint
 * is not called with an empty basket.
 */
export const logSaleSchema = z.object({
  branchId: z.string().min(1, "Branch is required."),
  items: z
    .array(saleItemInputSchema)
    .min(1, "A sale must have at least one item.")
    .max(20, "A sale cannot exceed 20 line items."),
});

export type LogSaleInput = z.infer<typeof logSaleSchema>;
