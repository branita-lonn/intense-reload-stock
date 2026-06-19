// app/dashboard/activity-log/page.tsx
// Page component for querying stock movement activity logs.
// Resolves role-scoped branch lists and staff logs for the filtering client.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { ActivityLogClient } from "@/components/dashboard/activity-log-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity Log | Intense Reload",
  description: "View and filter stock movement activity log.",
};

interface ActivityLogPageProps {
  searchParams: Promise<{ branch?: string }>;
}

export default async function ActivityLogPage({ searchParams }: ActivityLogPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // 1. Get accessible branches
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
          You are not assigned to any active branch. Please contact your manager.
        </p>
      </div>
    );
  }

  // 2. Fetch staff list for filters
  let staffList: Array<{ id: string; name: string | null }> = [];
  if (session.user.role === "OWNER") {
    staffList = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } else if (session.user.role === "BRANCH_MANAGER") {
    // Find branches manager has access to
    const managerAssignments = await prisma.userBranchAssignment.findMany({
      where: { userId: session.user.id },
      select: { branchId: true },
    });
    const managerBranchIds = managerAssignments.map((ma) => ma.branchId);

    // Get staff assigned to any of those branches
    staffList = await prisma.user.findMany({
      where: {
        isActive: true,
        branchAssignments: {
          some: { branchId: { in: managerBranchIds } },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  // Determine starting branch context
  const resolvedParams = await searchParams;
  let initialBranchId = resolvedParams.branch ?? "";
  if (session.user.role === "STAFF") {
    initialBranchId = branches[0]?.id ?? "";
  } else {
    const isAccessible = branches.some((b) => b.id === initialBranchId);
    if (!isAccessible) {
      initialBranchId = "all";
    }
  }

  return (
    <ActivityLogClient
      branches={branches}
      staffList={staffList}
      userRole={session.user.role}
      userId={session.user.id}
      initialBranchId={initialBranchId}
    />
  );
}
