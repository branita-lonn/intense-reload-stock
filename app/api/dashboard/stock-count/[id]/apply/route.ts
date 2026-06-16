// app/api/dashboard/stock-count/[id]/apply/route.ts
// POST API route for finalising a stock count session and writing inventory adjustments

import { requireSession, requireRole, requireBranchAccess } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { resolveNodeDisplayName } from "@/lib/inventory-queries";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    // Enforce role-based access: OWNER or BRANCH_MANAGER only to apply adjustments
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const { id: stockCountId } = await params;

    const stockCount = await prisma.stockCount.findUnique({
      where: { id: stockCountId },
      include: {
        items: true,
      },
    });

    if (!stockCount) {
      throw new NotFoundError("Stock count not found.");
    }

    // Enforce OWASP A01: Broken Access Control
    await requireBranchAccess(session.user.id, stockCount.branchId);

    if (stockCount.status !== "IN_PROGRESS") {
      throw new ValidationError("This count session is not in progress.");
    }

    // Check if any items are uncounted
    const uncountedItems = stockCount.items.filter((item) => item.countedQty === null);
    if (uncountedItems.length > 0) {
      throw new ValidationError(
        `All items must be counted before applying. ${uncountedItems.length} item(s) remain uncounted.`
      );
    }

    let appliedCount = 0;
    const skippedItems: string[] = [];
    let totalVariance = 0;

    const now = new Date();

    // Determine the note based on the scope
    let noteText = "Stock count reconciliation";
    if (stockCount.scope === "DRILL_DOWN_MIGRATION") {
      noteText = "Drill-down migration — initial count for newly tracked category";
    } else if (stockCount.scope === "VARIANT_CONVERSION_MIGRATION") {
      noteText = "Variant conversion — initial count for new variant";
    }

    await prisma.$transaction(async (tx) => {
      for (const item of stockCount.items) {
        const variance = (item.variance ?? 0);
        totalVariance += Math.abs(variance);

        const invWhere = {
          branchId: stockCount.branchId,
          ...(item.categoryId
            ? { categoryId: item.categoryId }
            : item.productId
            ? { productId: item.productId }
            : { productVariantId: item.productVariantId }),
        };

        const liveInventory = await tx.inventory.findFirst({
          where: invWhere,
        });

        // Resolve display name for skipped list
        const displayName = await resolveNodeDisplayName({
          categoryId: item.categoryId,
          productId: item.productId,
          productVariantId: item.productVariantId,
        });

        if (liveInventory?.isReferenceSnapshot) {
          skippedItems.push(displayName);
          continue;
        }

        // Apply count to Inventory
        if (!liveInventory) {
          // If the inventory record was not found, create it
          await tx.inventory.create({
            data: {
              branchId: stockCount.branchId,
              categoryId: item.categoryId ?? null,
              productId: item.productId ?? null,
              productVariantId: item.productVariantId ?? null,
              quantity: item.countedQty!,
            },
          });
        } else {
          await tx.inventory.update({
            where: { id: liveInventory.id },
            data: { quantity: item.countedQty! },
          });
        }

        // If variance is non-zero, create a StockMovement
        if (variance !== 0) {
          await tx.stockMovement.create({
            data: {
              branchId: stockCount.branchId,
              categoryId: item.categoryId ?? null,
              productId: item.productId ?? null,
              productVariantId: item.productVariantId ?? null,
              type: "ADJUSTMENT",
              quantityBefore: item.expectedQty,
              quantityAfter: item.countedQty!,
              quantityDelta: variance,
              note: noteText,
              stockCountId,
              performedById: session.user.id,
            },
          });
          appliedCount++;
        }
      }

      // Mark count session as completed
      await tx.stockCount.update({
        where: { id: stockCountId },
        data: {
          status: "COMPLETED",
          completedById: session.user.id,
          completedAt: now,
        },
      });
    });

    return Response.json({
      appliedCount,
      skippedItems,
      totalVariance,
    });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
