// app/dashboard/stock-count/page.tsx
// Server-side page for listing past stock count reconciliation history and launching manual counts

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { StockCountHistoryClient } from "@/components/dashboard/stock-count-history-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Reconciliation History | Intense Reload",
  description: "View past stock counts, active counting sessions, and reconciliation audits.",
};

interface StockCountHistoryPageProps {
  searchParams: Promise<{ branch?: string }>;
}

export default async function StockCountHistoryPage({ searchParams }: StockCountHistoryPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Retrieve current user's accessible branches
  const accessibleBranchIds = await getAccessibleBranchIds(session);
  const branches = await prisma.branch.findMany({
    where: { id: { in: accessibleBranchIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (branches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
        <h2 className="text-xl font-bold text-foreground">No Branch Assigned</h2>
        <p className="text-sm text-muted-foreground">
          You are not currently assigned to any active branch. Please contact your administrator.
        </p>
      </div>
    );
  }

  // Determine active branch context
  const resolvedParams = await searchParams;
  let activeBranchId = resolvedParams.branch ?? "";
  if (session.user.role === "STAFF") {
    activeBranchId = branches[0]?.id ?? "";
  } else {
    const isAccessible = branches.some((b) => b.id === activeBranchId);
    if (!isAccessible) {
      activeBranchId = branches[0]?.id ?? "";
    }
  }

  // Fetch past stock counts for the active branch
  const counts = await prisma.stockCount.findMany({
    where: { branchId: activeBranchId },
    include: {
      startedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      completedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        select: {
          id: true,
          expectedQty: true,
          countedQty: true,
          variance: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedCounts = counts.map((count) => {
    let totalVariance = 0;
    if (count.status === "COMPLETED") {
      totalVariance = count.items.reduce((sum, item) => sum + Math.abs(item.variance ?? 0), 0);
    }
    return {
      id: count.id,
      branchId: count.branchId,
      status: count.status,
      scope: count.scope,
      startedAt: count.startedAt.toISOString(),
      completedAt: count.completedAt ? count.completedAt.toISOString() : null,
      createdAt: count.createdAt.toISOString(),
      startedBy: count.startedBy,
      completedBy: count.completedBy,
      itemCount: count.items.length,
      totalVariance,
    };
  });

  const userRole = session.user.role;

  return (
    <StockCountHistoryClient
      initialCounts={formattedCounts}
      branches={branches}
      activeBranchId={activeBranchId}
      userRole={userRole}
    />
  );
}
