// app/api/dashboard/stock-count/[id]/route.ts
// GET API route for fetching details of a single stock count session

import { requireSession, requireBranchAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { handleApiError, NotFoundError } from "@/lib/errors";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    const { id: stockCountId } = await params;

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
      throw new NotFoundError("Stock count not found.");
    }

    // Enforce OWASP A01: Broken Access Control
    await requireBranchAccess(session.user.id, stockCount.branchId);

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

    return Response.json({
      ...stockCount,
      items: itemsWithDisplayNames,
    });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
