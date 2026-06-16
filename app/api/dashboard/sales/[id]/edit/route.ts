// app/api/dashboard/sales/[id]/edit/route.ts
// POST endpoint: edit-before-approve — corrects sale item quantities then immediately approves.
// Adjusts Inventory by the quantity difference and creates ADJUSTMENT StockMovements.
// Notifies the logging staff member of the correction. OWNER/BRANCH_MANAGER only.

import { requireSession, requireBranchAccess, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { editSaleSchema } from "@/lib/validations/sale-review";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const { id: saleId } = await params;

    const body = (await request.json()) as unknown;
    const parsed = editSaleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body.", parsed.error);
    }

    const { items: editItems } = parsed.data;

    // Fetch sale with items for the edit + approval
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    if (!sale) {
      throw new NotFoundError("Sale not found.");
    }

    await requireBranchAccess(session.user.id, sale.branchId);

    if (sale.status !== "PENDING") {
      throw new ValidationError("This sale has already been reviewed.");
    }

    const now = new Date();

    // Track which items were actually changed (for the notification summary)
    interface ChangeRecord {
      saleItemId: string;
      oldQuantity: number;
      newQuantity: number;
    }
    const changes: ChangeRecord[] = [];

    await prisma.$transaction(async (tx) => {
      for (const edit of editItems) {
        const saleItem = sale.items.find((i) => i.id === edit.saleItemId);
        if (!saleItem) {
          throw new ValidationError(
            `Sale item ${edit.saleItemId} does not belong to this sale.`
          );
        }

        const quantityDifference = edit.newQuantity - saleItem.quantity;

        if (quantityDifference !== 0) {
          // Resolve the Inventory row for this item
          const invWhere = {
            branchId: sale.branchId,
            ...(saleItem.categoryId
              ? { categoryId: saleItem.categoryId }
              : saleItem.productId
              ? { productId: saleItem.productId }
              : { productVariantId: saleItem.productVariantId }),
          };

          const currentInv = await tx.inventory.findFirst({ where: invWhere });

          if (!currentInv) {
            throw new NotFoundError(
              "Inventory record for a sale item could not be found. The item may have been reconfigured."
            );
          }

          const quantityBefore = currentInv.quantity;
          // If staff logged 5 but manager corrects to 2, quantityDifference = -3.
          // We adjust by -quantityDifference (+3) — giving 3 units back to inventory.
          const quantityAfter = quantityBefore - quantityDifference;

          await tx.inventory.update({
            where: { id: currentInv.id },
            data: { quantity: quantityAfter },
          });

          // A09: adjustment movement — append-only, never edits the original SALE movement
          await tx.stockMovement.create({
            data: {
              branchId: sale.branchId,
              categoryId: saleItem.categoryId ?? null,
              productId: saleItem.productId ?? null,
              productVariantId: saleItem.productVariantId ?? null,
              type: "ADJUSTMENT",
              quantityBefore,
              quantityAfter,
              quantityDelta: -quantityDifference, // positive if reducing sale qty, negative if increasing
              note: `Sale quantity corrected from ${saleItem.quantity} to ${edit.newQuantity} during review`,
              saleId,
              performedById: session.user.id,
            },
          });

          // Update the SaleItem quantity to the corrected value
          await tx.saleItem.update({
            where: { id: saleItem.id },
            data: { quantity: edit.newQuantity },
          });

          changes.push({
            saleItemId: saleItem.id,
            oldQuantity: saleItem.quantity,
            newQuantity: edit.newQuantity,
          });
        }
      }

      // Approve in the same transaction as the edits — atomic edit-and-approve
      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: "APPROVED",
          reviewedById: session.user.id,
          reviewedAt: now,
        },
      });

      // A09: audit log for the edit+approval action
      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: sale.loggedById,
          action: "SALE_EDITED",
          details: {
            saleId,
            branchId: sale.branchId,
            changes: changes as unknown as Prisma.InputJsonValue,
          } as Prisma.InputJsonValue,
        },
      });
    });

    // Notify the logging staff member of the correction (outside transaction — best-effort)
    const changeCount = changes.length;
    const changesSummary =
      changeCount > 0
        ? `${changeCount} item quantity${changeCount > 1 ? " quantities were" : " was"} corrected before approval.`
        : "The sale was approved without quantity changes.";

    await createNotification({
      userId: sale.loggedById,
      type: "SALE_EDITED",
      title: "A sale you logged was corrected",
      body: `A manager reviewed and corrected a sale you logged. ${changesSummary}`,
      linkUrl: `/dashboard/sales?status=APPROVED`,
      relatedSaleId: saleId,
    });

    return Response.json({ success: true, saleId, changes }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
