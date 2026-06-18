// app/dashboard/settings/page.tsx
// Server page — fetches StoreSettings and branches, redirects non-OWNER users.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreateStoreSettings } from "@/lib/get-store-settings";
import { SettingsClient } from "@/components/dashboard/settings-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Store Settings | Intense Reload",
  description: "Configure store-wide feature flags and settings for Intense Reload.",
};

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  // Live DB checks — re-validate both activation and role (OWASP A01).
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });
  if (!currentUser?.isActive) redirect("/auth/login");
  if (currentUser.role !== "OWNER") redirect("/dashboard");

  const [settings, branches, pendingSaleCount] = await Promise.all([
    getOrCreateStoreSettings(),
    prisma.branch.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        town: true,
        requireSaleApprovalOverride: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.sale.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <SettingsClient
      initialSettings={{
        id: settings.id,
        storeName: settings.storeName,
        requireSaleApproval: settings.requireSaleApproval,
        enableDetailedSaleBreakdown: settings.enableDetailedSaleBreakdown,
        enablePOS: settings.enablePOS,
        enableBarcodeScanning: settings.enableBarcodeScanning,
        enableStockValueTracking: settings.enableStockValueTracking,
      }}
      branches={branches}
      pendingSaleCount={pendingSaleCount}
    />
  );
}
