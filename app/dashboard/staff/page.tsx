// app/dashboard/staff/page.tsx
// Staff management page — visible only to OWNER and BRANCH_MANAGER.
// Displays a role-scoped staff table with inline active toggle and role-change sheet.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { StaffTable } from "@/components/dashboard/staff-table";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff Management | Intense Reload",
  description: "Create and manage staff accounts, roles, and branch assignments.",
};

export default async function StaffPage() {
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

  const isOwner = session.user.role === "OWNER";

  // Fetch staff list scoped by role
  let staff;
  if (isOwner) {
    staff = await prisma.user.findMany({
      where: { role: { not: "OWNER" } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        branchAssignments: {
          select: {
            id: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
  } else {
    const accessibleBranchIds = await getAccessibleBranchIds(session);
    staff = await prisma.user.findMany({
      where: {
        role: { not: "OWNER" },
        branchAssignments: {
          some: { branchId: { in: accessibleBranchIds } },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        branchAssignments: {
          where: { branchId: { in: accessibleBranchIds } },
          select: {
            id: true,
            branchId: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  // Fetch branches available for assignment (scoped to caller's access)
  let availableBranches;
  if (isOwner) {
    availableBranches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, town: true },
      orderBy: { name: "asc" },
    });
  } else {
    const accessibleBranchIds = await getAccessibleBranchIds(session);
    availableBranches = await prisma.branch.findMany({
      where: { id: { in: accessibleBranchIds }, isActive: true },
      select: { id: true, name: true, town: true },
      orderBy: { name: "asc" },
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Staff
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOwner
              ? "Manage all staff accounts, roles, and branch access."
              : "Manage staff assigned to your branches."}
          </p>
        </div>
      </div>

      <StaffTable
        staff={staff}
        isOwner={isOwner}
        availableBranches={availableBranches}
      />
    </div>
  );
}
