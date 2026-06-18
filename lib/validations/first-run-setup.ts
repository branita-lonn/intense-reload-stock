// lib/validations/first-run-setup.ts
// Purpose: Zod schema for the one-time first-run owner setup form.

import { z } from "zod";

export const firstRunSetupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(100),
});

export type FirstRunSetupInput = z.infer<typeof firstRunSetupSchema>;
