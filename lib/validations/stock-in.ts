import { z } from "zod";
import { parse, isValid } from "date-fns";

// Validated as a string in dd/mm/yyyy format per the owner's preference,
// parsed to Date on the server before writing to Prisma.
const stockInDateSchema = z
  .string()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: "Date must be in DD/MM/YYYY format.",
  })
  .refine(
    (val) => {
      const parsed = parse(val, "dd/MM/yyyy", new Date());
      return isValid(parsed);
    },
    {
      message: "Invalid calendar date.",
    }
  );

/**
 * Polymorphic parent reference for a stock-bearing Inventory node.
 * Exactly one of categoryId / productId / productVariantId must be provided.
 *
 * This mirrors the `inventoryParentSchema` shape from lib/validations/inventory.ts
 * but is embedded here as a .refine() step so the error is co-located with the
 * stock-in context and carries a stock-in-specific message.
 */
const inventoryNodeRefSchema = z
  .object({
    categoryId: z.string().cuid().nullable().optional(),
    productId: z.string().cuid().nullable().optional(),
    productVariantId: z.string().cuid().nullable().optional(),
  })
  .refine(
    (d) => {
      const set = [d.categoryId, d.productId, d.productVariantId].filter(Boolean).length;
      return set === 1;
    },
    {
      message:
        "Each stock-in item must target exactly one stock-bearing level: Category, Product, or ProductVariant.",
      path: ["categoryId"],
    }
  );

/**
 * Schema for a single item in a stock-in batch.
 *
 * branchId must be a CUID matching an existing Branch row.
 * Per-item branch-access is checked server-side (requireBranchAccess) —
 * NOT just once for the whole batch — so a payload mixing branches the user
 * can't access will be caught per-item rather than passing silently.
 */
export const stockInItemSchema = inventoryNodeRefSchema.and(
  z.object({
    branchId: z.string().cuid({ message: "A valid branch ID is required." }),
    quantityAdded: z
      .number({ message: "Quantity is required and must be a number." })
      .int({ message: "Quantity must be a whole number." })
      .positive({ message: "Quantity must be greater than zero." })
      .max(100_000, { message: "Quantity cannot exceed 100,000 units per item." }),
    note: z
      .string()
      .trim()
      .max(255, { message: "Note must be 255 characters or fewer." })
      .optional(),
    stockInDate: stockInDateSchema.optional().nullable(),
  })
);

export type StockInItemInput = z.infer<typeof stockInItemSchema>;

/**
 * Schema for a complete stock-in batch submission.
 * min(1) prevents empty submissions; max(50) bounds the batch size.
 */
export const stockInBatchSchema = z.object({
  items: z
    .array(stockInItemSchema)
    .min(1, { message: "At least one item is required." })
    .max(50, { message: "A batch cannot exceed 50 items. Use the CSV import for larger restocks." }),
});

export type StockInBatchInput = z.infer<typeof stockInBatchSchema>;

/**
 * Schema for editing a stock-in date.
 * Supports bulk editing (up to 50 movements).
 */
export const editStockInDateSchema = z.object({
  stockMovementIds: z.array(z.string().cuid()).min(1).max(50),
  stockInDate: stockInDateSchema,
});

export type EditStockInDateInput = z.infer<typeof editStockInDateSchema>;
