// app/dashboard/receipt/[id]/page.tsx
// Server component page that loads receipt data and renders the Receipt component.

import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSession, requireBranchAccess } from "@/lib/authz";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";
import { Receipt } from "@/components/dashboard/receipt";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReceiptPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession();

  const sale = await prisma.sale.findUnique({
    where: { id },
    include: {
      items: true,
      branch: {
        select: {
          name: true,
          contactNumber: true,
        },
      },
      loggedBy: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!sale) {
    notFound();
  }

  // A01: Enforce branch access check
  await requireBranchAccess(session.user.id, sale.branchId);

  // Fetch store setting for stock value tracking
  const settings = await prisma.storeSettings.findFirst({
    select: { enableStockValueTracking: true },
  });
  const enableStockValueTracking = settings?.enableStockValueTracking ?? false;

  // Resolve details and prices for each item
  const itemsWithPrices = await Promise.all(
    sale.items.map(async (item) => {
      const displayName = await resolveNodeDisplayName(item);
      let unitPrice: number | undefined = undefined;

      if (enableStockValueTracking && item.productVariantId) {
        const variant = await prisma.productVariant.findUnique({
          where: { id: item.productVariantId },
          select: { sellingPrice: true },
        });
        if (variant?.sellingPrice) {
          unitPrice = Number(variant.sellingPrice);
        }
      }

      return {
        displayName,
        quantity: item.quantity,
        ...(unitPrice !== undefined ? { unitPrice } : {}),
      };
    })
  );

  let total: number | undefined = undefined;
  if (enableStockValueTracking) {
    total = itemsWithPrices.reduce(
      (sum, item) => sum + (item.unitPrice ?? 0) * item.quantity,
      0
    );
  }

  const receiptData = {
    receiptNumber: sale.receiptNumber,
    branchName: sale.branch.name,
    branchContact: sale.branch.contactNumber,
    saleDate: sale.createdAt.toISOString(),
    items: itemsWithPrices,
    paymentMethod: sale.paymentMethod,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    total,
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
      {/* CSS overrides to hide layout sidebar and header on client side */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Hide sidebar navigation */
        aside {
          display: none !important;
        }
        /* Hide mobile header */
        .lg\\:hidden.fixed.top-0 {
          display: none !important;
        }
        /* Hide mobile header spacer */
        .lg\\:hidden.h-14.w-full {
          display: none !important;
        }
        /* Hide desktop header */
        header {
          display: none !important;
        }
        /* Unconstrain main layout */
        main {
          padding: 0 !important;
          margin: 0 !important;
          max-width: 100% !important;
          width: 100% !important;
        }
      `}} />
      <Receipt data={receiptData} />
    </div>
  );
}
