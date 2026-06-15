// lib/validations/user.ts
// Zod schemas for staff account management: creation, role changes, and branch assignments.

import { z } from "zod";

// OWNER accounts cannot be created through this form — only BRANCH_MANAGER or STAFF.
export const createStaffSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(100, "Name cannot exceed 100 characters."),
  email: z
    .string()
    .email("Please enter a valid email address.")
    .max(255, "Email cannot exceed 255 characters."),
  role: z.enum(["BRANCH_MANAGER", "STAFF"] as const, {
    error: () => ({ message: "Role must be BRANCH_MANAGER or STAFF." }),
  }),
  branchIds: z
    .array(z.string().min(1))
    .min(1, "At least one branch assignment is required."),
  temporaryPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters.")
    .max(128, "Temporary password cannot exceed 128 characters."),
});

export const updateUserRoleSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  newRole: z.enum(["BRANCH_MANAGER", "STAFF"] as const, {
    error: () => ({ message: "Role must be BRANCH_MANAGER or STAFF." }),
  }),
});

export const assignBranchSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  branchId: z.string().min(1, "Branch ID is required."),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type AssignBranchInput = z.infer<typeof assignBranchSchema>;
