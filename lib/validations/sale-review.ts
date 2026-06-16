// lib/validations/sale-review.ts
// Zod schemas for validating owner/manager sale approval, rejection, and edit actions.

import { z } from "zod";

/**
 * Validation schema for modifying a single sale item's quantity during the edit-before-approve workflow.
 */
export const editSaleItemSchema = z.object({
  saleItemId: z.string().min(1, "Sale item ID is required."),
  newQuantity: z
    .number()
    .int("Quantity must be a whole number.")
    .positive("Quantity must be at least 1.")
    .max(1000, "Quantity cannot exceed 1000 units."),
});

export type EditSaleItemInput = z.infer<typeof editSaleItemSchema>;

/**
 * Validation schema for bulk approval of multiple sales.
 * Enforces a minimum of 1 and maximum of 100 sales per batch to bound server resources.
 */
export const approveSalesSchema = z.object({
  saleIds: z
    .array(z.string().min(1))
    .min(1, "At least one sale ID must be provided.")
    .max(100, "Cannot bulk approve more than 100 sales at a time."),
});

export type ApproveSalesInput = z.infer<typeof approveSalesSchema>;

/**
 * Validation schema for rejecting a sale.
 * rejectionReason is optional, max 255 characters to match DB column constraint.
 */
export const rejectSaleSchema = z.object({
  saleId: z.string().min(1, "Sale ID is required."),
  reason: z
    .string()
    .max(255, "Rejection reason cannot exceed 255 characters.")
    .optional(),
});

export type RejectSaleInput = z.infer<typeof rejectSaleSchema>;

/**
 * Validation schema for edit-before-approve workflow.
 * Allows editing one or more line item quantities on a sale before completing approval.
 */
export const editSaleSchema = z.object({
  saleId: z.string().min(1, "Sale ID is required."),
  items: z
    .array(editSaleItemSchema)
    .min(1, "At least one sale item edit must be provided."),
});

export type EditSaleInput = z.infer<typeof editSaleSchema>;
