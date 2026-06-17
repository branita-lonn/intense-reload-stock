// lib/validations/settings.ts
// Zod schema for validating PATCH /api/dashboard/settings request bodies.

import { z } from "zod";

export const updateStoreSettingsSchema = z.object({
  storeName: z.string().min(1).max(100).optional(),
  requireSaleApproval: z.boolean().optional(),
  enableDetailedSaleBreakdown: z.boolean().optional(),
  enablePOS: z.boolean().optional(),
  enableBarcodeScanning: z.boolean().optional(),
  enableStockValueTracking: z.boolean().optional(),
});

export type UpdateStoreSettingsInput = z.infer<typeof updateStoreSettingsSchema>;
