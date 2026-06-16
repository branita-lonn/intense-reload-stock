// lib/validations/stock-count.ts
// Zod validation schemas for starting, submitting, and applying stock counts

import { z } from "zod";

/**
 * Zod validation schema for starting a new stock count session.
 * Enforces correct scope parameters based on selected scope.
 */
export const startStockCountSchema = z
  .object({
    branchId: z.string().min(1, "Branch ID is required"),
    scope: z.enum(["FULL_BRANCH", "DRILL_DOWN_MIGRATION", "VARIANT_CONVERSION_MIGRATION"]),
    scopeCategoryIds: z.array(z.string()).optional(),
    scopeProductId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.scope === "DRILL_DOWN_MIGRATION") {
        return (
          Array.isArray(data.scopeCategoryIds) &&
          data.scopeCategoryIds.length > 0 &&
          !data.scopeProductId
        );
      }
      if (data.scope === "VARIANT_CONVERSION_MIGRATION") {
        return (
          !!data.scopeProductId &&
          (!data.scopeCategoryIds || data.scopeCategoryIds.length === 0)
        );
      }
      if (data.scope === "FULL_BRANCH") {
        return (
          (!data.scopeCategoryIds || data.scopeCategoryIds.length === 0) &&
          !data.scopeProductId
        );
      }
      return false;
    },
    {
      message: "Scope parameters do not match the selected scope.",
      path: ["scope"],
    }
  );

export type StartStockCountInput = z.infer<typeof startStockCountSchema>;

/**
 * Zod validation schema for submitting counted quantities.
 * Enables partial or complete count submission with validation checks.
 */
export const submitCountSchema = z.object({
  stockCountId: z.string().min(1, "Stock Count ID is required"),
  items: z
    .array(
      z.object({
        stockCountItemId: z.string().min(1, "Stock Count Item ID is required"),
        countedQty: z
          .number()
          .int("Counted quantity must be an integer")
          .nonnegative("Counted quantity cannot be negative"),
      })
    )
    .min(1, "At least one item must be submitted"),
});

export type SubmitCountInput = z.infer<typeof submitCountSchema>;

/**
 * Zod validation schema for finalizing and applying a stock count.
 */
export const applyCountSchema = z.object({
  stockCountId: z.string().min(1, "Stock Count ID is required"),
});

export type ApplyCountInput = z.infer<typeof applyCountSchema>;
