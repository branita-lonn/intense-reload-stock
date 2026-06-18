// lib/get-store-settings.ts
// Returns the StoreSettings singleton, creating it with defaults if it doesn't exist.
// Safe to call on a fresh database with no seed — idempotent.

import "server-only";
import { prisma } from "@/lib/prisma";
import type { StoreSettings } from "@prisma/client";

const DEFAULT_SETTINGS = {
  storeName: "Intense Reload",
  requireSaleApproval: true,
  enablePOS: false,
  enableBarcodeScanning: false,
  enableStockValueTracking: false,
  enableDetailedSaleBreakdown: false,
};

export async function getOrCreateStoreSettings(): Promise<StoreSettings> {
  const existing = await prisma.storeSettings.findFirst();
  if (existing) return existing;
  return prisma.storeSettings.create({ data: DEFAULT_SETTINGS });
}
