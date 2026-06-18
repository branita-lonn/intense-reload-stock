// lib/validations/pos.ts
// Zod schemas for validating customer POS details and extending the core Log Sale validation.

import { z } from "zod";
import { logSaleSchema } from "./sale";

const phoneRegex = /^(?:07|01)\d{8}$|^\+254\d{9}$/;

export const posDetailsSchema = z.object({
  paymentMethod: z.enum(["CASH", "MPESA", "CARD"]),
  customerName: z
    .string()
    .max(100, "Customer name must be 100 characters or fewer.")
    .optional()
    .nullable()
    .transform((val) => (val?.trim() === "" ? null : val)),
  customerPhone: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val || val.trim() === "") return true;
        return phoneRegex.test(val.trim());
      },
      {
        message: "Customer phone must be a valid Kenyan mobile number (e.g., 0712345678 or +254712345678).",
      }
    )
    .transform((val) => (val?.trim() === "" ? null : val)),
});

export const logSaleWithPosSchema = logSaleSchema.extend({
  posDetails: posDetailsSchema.optional().nullable(),
});

export type LogSaleWithPosInput = z.infer<typeof logSaleWithPosSchema>;
