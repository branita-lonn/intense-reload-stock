// lib/validations/inventory.ts
// Zod validations and assertions to enforce polymorphic constraints on the Inventory model

import { z } from "zod";

/**
 * Zod validation schema for the polymorphic parent check.
 * Enforces that EXACTLY ONE of categoryId, productId, or productVariantId is set.
 * 
 * DESIGN RATIONALE:
 * This serves as the application-layer enforcement of the database constraint (defence in depth - OWASP A04).
 * Prisma doesn't support database-level partial/conditional CHECK constraints directly in schema.prisma,
 * so we validate here and add database-level unique indexes to prevent accidental duplication.
 */
export const inventoryParentSchema = z
  .object({
    categoryId: z.string().nullable().optional(),
    productId: z.string().nullable().optional(),
    productVariantId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      const catSet = !!data.categoryId;
      const prodSet = !!data.productId;
      const varSet = !!data.productVariantId;

      // True only if exactly one of them is truthy
      return (catSet && !prodSet && !varSet) ||
             (!catSet && prodSet && !varSet) ||
             (!catSet && !prodSet && varSet);
    },
    {
      message: "Inventory record must target exactly one level: Category, Product, or ProductVariant.",
      path: ["categoryId"], // Default error path
    }
  );

export type InventoryParentInput = z.infer<typeof inventoryParentSchema>;

/**
 * Reusable helper to assert that an inventory model update matches the polymorphic constraint.
 * Throws a descriptive error if the rule is violated.
 */
export function assertExactlyOneStockParent(input: {
  categoryId?: string | null;
  productId?: string | null;
  productVariantId?: string | null;
}): void {
  const result = inventoryParentSchema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Inventory parent validation failed");
  }
}
