// app/dashboard/log-sale/page.tsx
// Page component for counter sale logging. Fetches active branch context and passes settings to client form.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleBranchIds } from "@/lib/authz";
import { LogSaleForm } from "@/components/dashboard/log-sale-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log Sale | Intense Reload",
  description: "Record sales at the counter.",
};

interface LogSalePageProps {
  searchParams: Promise<{ branch?: string }>;
}

export default async function LogSalePage({ searchParams }: LogSalePageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Fetch store settings for global approval flags
  const settings = await prisma.storeSettings.findFirst({
    select: {
      requireSaleApproval: true,
      enableDetailedSaleBreakdown: true,
      enableBarcodeScanning: true,
      enablePOS: true,
    },
  });

  const requireSaleApproval = settings?.requireSaleApproval ?? true;
  const enableDetailedSaleBreakdown = settings?.enableDetailedSaleBreakdown ?? false;
  const enableBarcodeScanning = settings?.enableBarcodeScanning ?? false;
  const enablePOS = settings?.enablePOS ?? false;

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

  // Determine active branch context.
  // STAFF only gets their single assigned branch (ignores query param).
  // OWNER / BRANCH_MANAGER gets query param if provided and accessible; else first accessible branch.
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

  // Load initial inventory rows for the selected branch to boot the combobox
  const inventoryData = await prisma.inventory.findMany({
    where: { branchId: activeBranchId, isReferenceSnapshot: false },
    include: {
      branch: { select: { name: true } },
      category: true,
      product: {
        include: {
          variants: { select: { id: true } },
          inventoryRecords: { include: { branch: { select: { name: true } } } },
        },
      },
      productVariant: {
        include: {
          product: { include: { category: true } },
        },
      },
    },
  });

  // Fetch all categories for path building
  const allCategories = await prisma.category.findMany({
    where: { isActive: true },
  });

  // Map to InventoryRow structure to match lib/inventory-queries shape
  function buildPath(categoryId: string): string {
    const path: string[] = [];
    let current = allCategories.find((c) => c.id === categoryId);
    while (current) {
      path.unshift(current.name);
      const parentId = current.parentId;
      current = parentId ? allCategories.find((c) => c.id === parentId) : undefined;
    }
    return path.join(" › ");
  }

  const initialInventoryRows = inventoryData
    .map((inv) => {
      if (inv.categoryId && inv.category) {
        return {
          nodeType: "CATEGORY" as const,
          nodeId: inv.categoryId,
          displayName: inv.category.name,
          categoryPath: buildPath(inv.categoryId),
          categoryId: inv.categoryId,
          branchId: inv.branchId,
          branchName: inv.branch.name,
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          isLowStock: inv.quantity <= inv.lowStockThreshold,
        };
      } else if (inv.productId && inv.product) {
        return {
          nodeType: "PRODUCT" as const,
          nodeId: inv.productId,
          displayName: inv.product.name,
          categoryPath: buildPath(inv.product.categoryId),
          categoryId: inv.product.categoryId,
          productId: inv.productId,
          branchId: inv.branchId,
          branchName: inv.branch.name,
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          isLowStock: inv.quantity <= inv.lowStockThreshold,
          productHasVariants: inv.product.variants.length > 0,
          productDetails: {
            id: inv.product.id,
            name: inv.product.name,
            inventoryRecords: inv.product.inventoryRecords,
          },
        };
      } else if (inv.productVariantId && inv.productVariant) {
        const variant = inv.productVariant;
        const product = variant.product;
        const variantParts = [variant.colour, variant.size].filter(Boolean).join(" ");
        const displayName = `${product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();
        return {
          nodeType: "VARIANT" as const,
          nodeId: inv.productVariantId,
          displayName,
          categoryPath: buildPath(product.categoryId),
          categoryId: product.categoryId,
          productId: product.id,
          productVariantId: inv.productVariantId,
          branchId: inv.branchId,
          branchName: inv.branch.name,
          quantity: inv.quantity,
          lowStockThreshold: inv.lowStockThreshold,
          isLowStock: inv.quantity <= inv.lowStockThreshold,
        };
      }
      return null;
    })
    .filter((row): row is Exclude<typeof row, null> => row !== null);

  return (
    <LogSaleForm
      branches={branches}
      activeBranchId={activeBranchId}
      initialInventoryRows={initialInventoryRows}
      requireSaleApproval={requireSaleApproval}
      enableDetailedSaleBreakdown={enableDetailedSaleBreakdown}
      userRole={session.user.role}
      enableBarcodeScanning={enableBarcodeScanning}
      enablePOS={enablePOS}
    />
  );
}
