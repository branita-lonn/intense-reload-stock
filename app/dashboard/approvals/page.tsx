// app/dashboard/approvals/page.tsx
// Server component for approvals queue dashboard.
// Restricts access to OWNER and BRANCH_MANAGER. Resolves accessible branches.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { ApprovalsClient } from "@/components/dashboard/approvals-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pending Approvals | Intense Reload",
  description: "Review, approve, correct, or reject sales logged at your branches.",
};

interface ApprovalsPageProps {
  searchParams: Promise<{ branch?: string }>;
}

export default async function ApprovalsPage({ searchParams }: ApprovalsPageProps) {
  const session = await auth();

  // 1. Session & role validation
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Double check that user has manager or owner access
  const isOwner = session.user.role === "OWNER";
  const isManager = session.user.role === "BRANCH_MANAGER";
  if (!isOwner && !isManager) {
    redirect("/dashboard");
  }

  // 2. Fetch accessible branches
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

  // 3. Resolve initial branch parameter context
  const resolvedParams = await searchParams;
  let initialBranchId = resolvedParams.branch ?? "";
  const isAccessible = branches.some((b) => b.id === initialBranchId);
  if (!isAccessible) {
    initialBranchId = "all";
  }

  return (
    <ApprovalsClient
      branches={branches}
      userRole={session.user.role}
      userId={session.user.id}
      initialBranchId={initialBranchId}
    />
  );
}
