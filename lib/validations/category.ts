// lib/validations/category.ts
// Zod schemas for validating category CRUD, stock-bearing toggles, and drill-down requests.

import { z } from "zod";

export const categorySchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name cannot exceed 100 characters."),
  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters.")
    .nullable()
    .optional()
    .or(z.literal("")),
  imageUrl: z
    .string()
    .url("Must be a valid URL format.")
    .nullable()
    .optional()
    .or(z.literal("")),
  parentId: z
    .string()
    .nullable()
    .optional()
    .or(z.literal("")),
  sortOrder: z
    .number()
    .default(0),
  isActive: z
    .boolean()
    .default(true),
});

export const toggleStockBearingSchema = z.object({
  categoryId: z.string().min(1, "Category ID is required."),
  enable: z.boolean(),
});

export const drillDownSchema = z.object({
  parentCategoryId: z.string().min(1, "Parent Category ID is required."),
  // childCategoryIds represents "categories the owner is most interested in tracking separately,"
  // but the API guarantees ALL siblings become stock-bearing to avoid orphaning any of them.
  childCategoryIds: z.array(z.string()).min(1, "At least one child category must be selected."),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type ToggleStockBearingInput = z.infer<typeof toggleStockBearingSchema>;
export type DrillDownInput = z.infer<typeof drillDownSchema>;
