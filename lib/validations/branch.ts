// lib/validations/branch.ts
// Zod validation schemas for branch creation and update inputs.

import { z } from "zod";

export const branchSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name cannot exceed 100 characters."),
  town: z
    .string()
    .min(2, "Town must be at least 2 characters.")
    .max(100, "Town cannot exceed 100 characters."),
  address: z
    .string()
    .max(255, "Address cannot exceed 255 characters.")
    .optional()
    .or(z.literal("")),
  contactNumber: z
    .string()
    .max(20, "Contact number cannot exceed 20 characters.")
    .regex(/^(?:\+254|0)[17]\d{8}$/, "Invalid Kenyan phone number format (use +254... or 07... or 01...)")
    .optional()
    .or(z.literal("")),
});

export const branchUpdateSchema = branchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type BranchInput = z.infer<typeof branchSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;
