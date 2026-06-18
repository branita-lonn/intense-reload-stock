// lib/sale-settings.ts
// Helper to determine the effective sale approval setting (inherited or branch override).

import { prisma } from "@/lib/prisma";

/**
 * Fetches the branch's requireSaleApprovalOverride.
 * If non-null, returns the override value.
 * Otherwise, falls back to StoreSettings.requireSaleApproval.
 *
 * @param branchId - The branch ID to check.
 */
export async function getEffectiveApprovalSetting(branchId: string): Promise<boolean> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { requireSaleApprovalOverride: true },
  });

  if (branch && branch.requireSaleApprovalOverride !== null) {
    return branch.requireSaleApprovalOverride;
  }

  const settings = await prisma.storeSettings.findFirst({
    select: { requireSaleApproval: true },
  });

  return settings?.requireSaleApproval ?? true;
}

/**
 * Helper to determine the effective POS setting.
 * Currently reads directly from global StoreSettings.enablePOS.
 *
 * @param branchId - The branch ID to check (for future branch-specific overrides).
 */
export async function getEffectivePosSetting(branchId: string): Promise<boolean> {
  const settings = await prisma.storeSettings.findFirst({
    select: { enablePOS: true },
  });

  return settings?.enablePOS ?? false;
}

/**
 * Helper to determine the effective Detailed Sale Breakdown setting.
 * Reads directly from global StoreSettings.enableDetailedSaleBreakdown.
 * Breakdown items are annotation-only and do NOT affect Inventory.
 *
 * @param _branchId - Reserved for future branch-level overrides.
 */
export async function getEffectiveBreakdownSetting(_branchId: string): Promise<boolean> {
  const settings = await prisma.storeSettings.findFirst({
    select: { enableDetailedSaleBreakdown: true },
  });

  return settings?.enableDetailedSaleBreakdown ?? false;
}
