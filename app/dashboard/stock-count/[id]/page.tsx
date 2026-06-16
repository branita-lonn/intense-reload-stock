// app/dashboard/stock-count/[id]/page.tsx
// Server-side page for displaying stock count details (active counting or read-only history)

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireBranchAccess } from "@/lib/authz";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";
import { StockCountClient } from "@/components/dashboard/stock-count-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Count | Intense Reload",
  description: "Perform stock reconciliation or review completed session history.",
};

interface StockCountDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default async function StockCountDetailsPage({ params }: StockCountDetailsPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const { id: stockCountId } = await params;

  // Retrieve the stock count session
  const stockCount = await prisma.stockCount.findUnique({
    where: { id: stockCountId },
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
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (!stockCount) {
    redirect("/dashboard/inventory");
  }

  // Enforce branch-scoped access
  await requireBranchAccess(session.user.id, stockCount.branchId);

  // Fetch branch name
  const branch = await prisma.branch.findUnique({
    where: { id: stockCount.branchId },
    select: { name: true },
  });

  const branchName = branch?.name || "Unknown Branch";

  // Resolve display names for each item
  const itemsWithDisplayNames = await Promise.all(
    stockCount.items.map(async (item) => {
      const displayName = await resolveNodeDisplayName({
        categoryId: item.categoryId,
        productId: item.productId,
        productVariantId: item.productVariantId,
      });
      return {
        ...item,
        displayName,
      };
    })
  );

  // Fetch migration reference label if applicable
  let migrationBannerText: string | null = null;
  if (stockCount.scope === "DRILL_DOWN_MIGRATION") {
    const childCategory = await prisma.category.findFirst({
      where: { id: { in: stockCount.scopeCategoryIds } },
      select: { parentId: true },
    });
    const parentCategoryId = childCategory?.parentId;
    if (parentCategoryId) {
      const snapshotInventory = await prisma.inventory.findFirst({
        where: {
          branchId: stockCount.branchId,
          categoryId: parentCategoryId,
          isReferenceSnapshot: true,
        },
      });
      migrationBannerText = snapshotInventory?.snapshotLabel || null;
    }
  } else if (stockCount.scope === "VARIANT_CONVERSION_MIGRATION" && stockCount.scopeProductId) {
    const snapshotInventory = await prisma.inventory.findFirst({
      where: {
        branchId: stockCount.branchId,
        productId: stockCount.scopeProductId,
        isReferenceSnapshot: true,
      },
    });
    migrationBannerText = snapshotInventory?.snapshotLabel || null;
  }

  const userRole = session.user.role;
  const currentUserId = session.user.id;

  return (
    <StockCountClient
      initialStockCount={{
        ...stockCount,
        items: itemsWithDisplayNames,
      }}
      branchName={branchName}
      migrationBannerText={migrationBannerText}
      userRole={userRole}
      currentUserId={currentUserId}
    />
  );
}
