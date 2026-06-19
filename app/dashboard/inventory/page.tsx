// app/dashboard/inventory/page.tsx
// Server component representing the primary Inventory Dashboard page.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { getInventoryRows } from "@/lib/inventory-queries";
import { InventoryClient } from "@/components/dashboard/inventory-client";
import type { CategoryWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Inventory Dashboard | Intense Reload",
  description: "Unified, branch-level inventory dashboard tracking real-time stock balances across all items.",
};

interface PageProps {
  searchParams: Promise<{
    branchId?: string;
    categoryId?: string;
    search?: string;
    lowStockOnly?: string;
  }>;
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Live account verification check
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

  // Resolve Next.js searchParams promise
  const resolvedSearchParams = await searchParams;
  const branchFilter = resolvedSearchParams.branchId || undefined;
  const categoryFilter = resolvedSearchParams.categoryId || undefined;
  const searchFilter = resolvedSearchParams.search || undefined;
  const lowStockOnly = resolvedSearchParams.lowStockOnly === "true";

  // Fetch user's allowed branches
  const accessibleBranchIds = await getAccessibleBranchIds(session);

  // Fetch branches metadata for frontend switcher list
  const branches = await prisma.branch.findMany({
    where: {
      isActive: true,
      ...(user.role !== "OWNER" ? { id: { in: accessibleBranchIds } } : {}),
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });

  // Fetch categories hierarchy config
  const categories = (await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  })) as CategoryWithRelations[];

  // Fetch store configuration for stock value cost-tracking
  const settings = await prisma.storeSettings.findFirst({
    select: { enableStockValueTracking: true },
  });
  const enableStockValueTracking = settings?.enableStockValueTracking ?? false;

  // Determine active branch scoped query scope
  let activeBranchIds: string[];
  if (branchFilter && accessibleBranchIds.includes(branchFilter)) {
    activeBranchIds = [branchFilter];
  } else {
    activeBranchIds = accessibleBranchIds;
  }

  // Retrieve initial server-side inventory rows
  let initialRows = await getInventoryRows({
    branchIds: activeBranchIds,
    categoryId: categoryFilter,
    search: searchFilter,
  });

  if (lowStockOnly) {
    initialRows = initialRows.filter((r) => r.isLowStock);
  }

  return (
    <div className="bg-card/40 p-0">
      <InventoryClient
        initialCategories={categories}
        branches={branches}
        userRole={user.role}
        initialBranchId={branchFilter}
        enableStockValueTracking={enableStockValueTracking}
        initialInventoryRows={initialRows}
      />
    </div>
  );
}
