// app/dashboard/stock-count/new/page.tsx
// Server-side page routing to initialize a new stock count session and resolve branch context

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { StockCountInitiator } from "@/components/dashboard/stock-count-initiator";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Stock Count | Intense Reload",
  description: "Initialize or resume a stock count session.",
};

interface NewStockCountPageProps {
  searchParams: Promise<{
    branch?: string;
    scope?: string;
    categoryIds?: string;
    productId?: string;
  }>;
}

export default async function NewStockCountPage({ searchParams }: NewStockCountPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const resolvedParams = await searchParams;
  const branchParam = resolvedParams.branch || "";
  const scopeParam = resolvedParams.scope || "FULL_BRANCH";
  const categoryIdsParam = resolvedParams.categoryIds || "";
  const productIdParam = resolvedParams.productId || "";

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

  // Resolve branch context
  let resolvedBranchId = branchParam;
  if (session.user.role === "STAFF") {
    // STAFF can only perform stock counts on their single assigned branch
    resolvedBranchId = branches[0]?.id || "";
  } else {
    // If a branch param is provided, verify accessibility
    if (resolvedBranchId) {
      const isAccessible = branches.some((b) => b.id === resolvedBranchId);
      if (!isAccessible) {
        resolvedBranchId = "";
      }
    }

    // If branch param is missing/inaccessible and user only has access to one branch, auto-use it
    if (!resolvedBranchId && branches.length === 1) {
      resolvedBranchId = branches[0]?.id || "";
    }
  }

  let scope = "FULL_BRANCH";
  let scopeCategoryIds: string[] | undefined = undefined;
  let scopeProductId: string | undefined = undefined;

  if (scopeParam === "drill-down" && categoryIdsParam) {
    scope = "DRILL_DOWN_MIGRATION";
    scopeCategoryIds = categoryIdsParam.split(",").filter(Boolean);
  } else if (scopeParam === "variant-conversion" && productIdParam) {
    scope = "VARIANT_CONVERSION_MIGRATION";
    scopeProductId = productIdParam;
  }

  return (
    <StockCountInitiator
      initialBranchId={resolvedBranchId}
      scope={scope}
      scopeCategoryIds={scopeCategoryIds}
      scopeProductId={scopeProductId}
      accessibleBranches={branches}
    />
  );
}
