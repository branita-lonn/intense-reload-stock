// app/dashboard/categories/page.tsx
// Server Component representing the Category Dashboard Page.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { CategoriesClient } from "@/components/dashboard/categories-client";

export const metadata: Metadata = {
  title: "Category Management | Intense Reload",
  description: "Configure product category structure, stock-bearing nodes, and inventory hierarchies.",
};

export default async function CategoriesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Live database check for account deactivation
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

  // Access Control: ONLY Owner and Branch Manager can view categories
  if (user.role !== "OWNER" && user.role !== "BRANCH_MANAGER") {
    redirect("/dashboard");
  }

  const branchIds = await getAccessibleBranchIds(session);

  // Fetch all categories with parent/children and counts
  const categories = await prisma.category.findMany({
    include: {
      parent: {
        select: {
          id: true,
          name: true,
        },
      },
      children: {
        select: {
          id: true,
          name: true,
          isStockBearing: true,
        },
      },
      _count: {
        select: { products: true },
      },
      inventoryRecords: {
        include: {
          branch: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: [
      { sortOrder: "asc" },
      { name: "asc" },
    ],
  });

  // Filter inventory records by user's accessible branches to enforce OWASP security model
  const securedCategories = categories.map((cat) => ({
    ...cat,
    inventoryRecords: cat.inventoryRecords.filter((inv) => branchIds.includes(inv.branchId)),
  }));

  const userRole = session.user.role;

  return (
    <div className="space-y-8">
      <CategoriesClient
        initialCategories={securedCategories}
        userRole={userRole}
      />
    </div>
  );
}
