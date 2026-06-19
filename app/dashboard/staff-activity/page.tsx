// app/dashboard/staff-activity/page.tsx
// Staff activity report page — visible only to OWNER and BRANCH_MANAGER.
// This module is READ-ONLY. StockMovement and UserActivityLog have no update/delete routes anywhere in this codebase, by design — do not add any here. (OWASP A09: Security Logging and Monitoring)

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { StaffActivityClient } from "@/components/dashboard/staff-activity-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff Activity | Intense Reload",
  description: "Aggregated performance reporting and logging summaries.",
};

export default async function StaffActivityPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/auth/login");

  // STAFF role cannot access this page — enforce server-side redirect
  if (session.user.role === "STAFF") redirect("/dashboard");

  // Live isActive re-check
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true },
  });
  if (!currentUser?.isActive) redirect("/auth/login");

  // Fetch branches available for filtering
  const accessibleBranchIds = await getAccessibleBranchIds(session);
  const branches = await prisma.branch.findMany({
    where: { id: { in: accessibleBranchIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <StaffActivityClient
      branches={branches}
      initialBranchId="all"
    />
  );
}
