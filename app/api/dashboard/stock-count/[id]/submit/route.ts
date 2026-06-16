// app/api/dashboard/stock-count/[id]/submit/route.ts
// PATCH API route for saving counted quantities on a stock count session

import { requireSession, requireBranchAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { submitCountSchema } from "@/lib/validations/stock-count";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    const { id: stockCountId } = await params;

    const stockCount = await prisma.stockCount.findUnique({
      where: { id: stockCountId },
    });

    if (!stockCount) {
      throw new NotFoundError("Stock count not found.");
    }

    // Enforce OWASP A01: Broken Access Control
    await requireBranchAccess(session.user.id, stockCount.branchId);

    // Enforce A04 (Insecure Design): status lock
    if (stockCount.status !== "IN_PROGRESS") {
      throw new ValidationError("This count has already been completed.");
    }

    const body = await request.json();
    const parsed = submitCountSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid parameters for submitting count", parsed.error);
    }

    const { stockCountId: bodyStockCountId, items } = parsed.data;

    if (bodyStockCountId !== stockCountId) {
      throw new ValidationError("Stock Count ID mismatch between route and body.");
    }

    // Fetch expected quantities for validation and variance computation
    const itemIds = items.map((i) => i.stockCountItemId);
    const dbItems = await prisma.stockCountItem.findMany({
      where: {
        id: { in: itemIds },
        stockCountId,
      },
    });

    if (dbItems.length !== items.length) {
      throw new ValidationError("One or more items do not belong to this stock count session.");
    }

    // Perform the updates in transaction
    const updates = items.map((item) => {
      const dbItem = dbItems.find((d) => d.id === item.stockCountItemId)!;
      const variance = item.countedQty - dbItem.expectedQty;
      return prisma.stockCountItem.update({
        where: { id: item.stockCountItemId },
        data: {
          countedQty: item.countedQty,
          variance,
        },
      });
    });

    await prisma.$transaction(updates);

    // Fetch the updated state of all items in this session
    const allSessionItems = await prisma.stockCountItem.findMany({
      where: { stockCountId },
    });

    const totalItems = allSessionItems.length;
    const countedCount = allSessionItems.filter((item) => item.countedQty !== null).length;
    const shortageCount = allSessionItems.filter(
      (item) => item.countedQty !== null && (item.variance ?? 0) < 0
    ).length;
    const surplusCount = allSessionItems.filter(
      (item) => item.countedQty !== null && (item.variance ?? 0) > 0
    ).length;

    const itemsWithDisplayNames = await Promise.all(
      allSessionItems.map(async (item) => {
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

    return Response.json({
      items: itemsWithDisplayNames,
      summary: {
        countedCount,
        totalItems,
        shortageCount,
        surplusCount,
      },
    });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
