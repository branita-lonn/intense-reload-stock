// app/dashboard/products/page.tsx
// Server Component for the Product Management page. Fetches initial products, categories, and branches.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { ProductsClient } from "@/components/dashboard/products-client";
import type { CategoryWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Product Management | Intense Reload",
  description: "Configure product catalog, variants, active states, and stock tracking modes.",
};

interface PageProps {
  searchParams: Promise<{
    categoryId?: string;
    search?: string;
    branchId?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Live check if user is active
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

  // Retrieve search filters from searchParams promise (Next.js 15+ convention)
  const resolvedSearchParams = await searchParams;
  const categoryFilter = resolvedSearchParams.categoryId || undefined;
  const searchFilter = resolvedSearchParams.search || undefined;
  const branchFilter = resolvedSearchParams.branchId || undefined;

  const accessibleBranchIds = await getAccessibleBranchIds(session);

  // Fetch branches
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

  // Fetch categories to build the filter hierarchy
  const categories = (await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  })) as CategoryWithRelations[];

  return (
    <div className="space-y-8">
      <ProductsClient
        initialCategories={categories}
        branches={branches}
        userRole={user.role}
        initialCategoryId={categoryFilter}
        initialSearch={searchFilter}
        initialBranchId={branchFilter}
        userId={session.user.id}
      />
    </div>
  );
}
