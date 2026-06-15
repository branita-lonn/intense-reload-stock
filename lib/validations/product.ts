// lib/validations/product.ts
// Zod schemas for validating product creation, updates, stock-bearing toggles, and variant conversions.

import { z } from "zod";

export const productSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(150, "Name cannot exceed 150 characters."),
  description: z
    .string()
    .max(2000, "Description cannot exceed 2000 characters.")
    .nullable()
    .optional()
    .or(z.literal("")),
  brand: z
    .string()
    .max(50, "Brand cannot exceed 50 characters.")
    .nullable()
    .optional()
    .or(z.literal("")),
  tags: z
    .array(
      z
        .string()
        .max(30, "Tag cannot exceed 30 characters.")
    )
    .max(15, "Cannot have more than 15 tags.")
    .default([]),
  categoryId: z.string().min(1, "Category is required."),
  isActive: z.boolean().default(true),
  images: z
    .array(z.string().url("Must be a valid URL format."))
    .max(8, "Cannot upload more than 8 images.")
    .default([]),
});

export const variantInputSchema = z.object({
  id: z.string().optional(),
  sku: z
    .string()
    .max(50, "SKU cannot exceed 50 characters.")
    .regex(/^[a-zA-Z0-9-]+$/, "SKU can only contain alphanumeric characters and hyphens.")
    .nullable()
    .optional()
    .or(z.literal("")),
  size: z
    .string()
    .max(20, "Size cannot exceed 20 characters.")
    .nullable()
    .optional()
    .or(z.literal("")),
  colour: z
    .string()
    .max(30, "Colour cannot exceed 30 characters.")
    .nullable()
    .optional()
    .or(z.literal("")),
  brand: z
    .string()
    .max(50, "Brand override cannot exceed 50 characters.")
    .nullable()
    .optional()
    .or(z.literal("")),
  costPrice: z
    .number()
    .min(0, "Cost price must be non-negative.")
    .nullable()
    .optional(),
  sellingPrice: z
    .number()
    .min(0, "Selling price must be non-negative.")
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
});

export const productWithVariantsSchema = productSchema.extend({
  variants: z.array(variantInputSchema).optional(),
});

export const toggleProductStockBearingSchema = z.object({
  productId: z.string().min(1, "Product ID is required."),
  enable: z.boolean(),
});

export const convertToVariantTrackingSchema = z.object({
  productId: z.string().min(1, "Product ID is required."),
  initialVariants: z.array(variantInputSchema).min(1, "At least one variant is required."),
});

export type ProductInput = z.infer<typeof productSchema>;
export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductWithVariantsInput = z.infer<typeof productWithVariantsSchema>;
export type ToggleProductStockBearingInput = z.infer<typeof toggleProductStockBearingSchema>;
export type ConvertToVariantTrackingInput = z.infer<typeof convertToVariantTrackingSchema>;
