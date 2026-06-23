// app/dashboard/inventory/stock-in-record/page.tsx
// Server component representing the Stock-In Record page.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { StockInRecordClient } from "@/components/dashboard/stock-in-record-client";

export const metadata: Metadata = {
  title: "Stock-In Record | Intense Reload",
  description: "View and manage physical stock-in delivery history and business dates.",
};

export default async function StockInRecordPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Live account verification check
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, isActive: true, role: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

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

  return (
    <div className="bg-card/40 p-0">
      <StockInRecordClient
        branches={branches}
        user={user}
      />
    </div>
  );
}
