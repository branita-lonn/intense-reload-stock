// app/api/dashboard/sales/[id]/receipt/route.ts
// API route for fetching auth-gated receipt data for a sale.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireBranchAccess } from "@/lib/authz";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    const { id } = await params;

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
      throw new NotFoundError("Sale not found.");
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

    return Response.json(
      {
        receiptNumber: sale.receiptNumber,
        branchName: sale.branch.name,
        branchContact: sale.branch.contactNumber,
        saleDate: sale.createdAt.toISOString(),
        items: itemsWithPrices,
        paymentMethod: sale.paymentMethod,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone, // customerPhone is personal data; treat accordingly
        total,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
