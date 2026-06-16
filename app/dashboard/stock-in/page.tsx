// app/dashboard/stock-in/page.tsx
// Server component hosting the StockInForm.
// Accessible from the inventory dashboard "Stock in" row actions and the sidebar nav.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { getInventoryRows } from "@/lib/inventory-queries";
import { StockInForm } from "@/components/dashboard/stock-in-form";

export const metadata: Metadata = {
  title: "Stock In | Intense Reload",
  description: "Record incoming stock deliveries across categories, products, and variants.",
};

interface PageProps {
  searchParams: Promise<{ branchId?: string }>;
}

export default async function StockInPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });
  if (!user?.isActive) redirect("/auth/login");

  const resolvedParams = await searchParams;
  const branchFilter = resolvedParams.branchId || undefined;

  const accessibleBranchIds = await getAccessibleBranchIds(session);

  const branches = await prisma.branch.findMany({
    where: {
      isActive: true,
      ...(user.role !== "OWNER" ? { id: { in: accessibleBranchIds } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // Determine the initial branch scope
  const initialBranchId =
    branchFilter && accessibleBranchIds.includes(branchFilter)
      ? branchFilter
      : accessibleBranchIds[0] ?? "";

  // Pre-load inventory rows for the initial branch
  const initialInventoryRows = initialBranchId
    ? await getInventoryRows({ branchIds: [initialBranchId] })
    : [];

  return (
    <div className="py-2">
      <StockInForm
        branches={branches}
        initialBranchId={initialBranchId}
        initialInventoryRows={initialInventoryRows}
      />
    </div>
  );
}
