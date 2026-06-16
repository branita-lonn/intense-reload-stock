// app/api/dashboard/sales/[id]/reject/route.ts
// POST endpoint: rejects a PENDING sale. OWNER/BRANCH_MANAGER only.
// Reverses the Inventory decrement that happened at logging time (Stage 5) by
// creating positive ADJUSTMENT StockMovement rows — never edits the original SALE rows.
// Notifies the staff member who logged the sale via createNotification.

import { requireSession, requireBranchAccess, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { rejectSaleSchema } from "@/lib/validations/sale-review";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const { id: saleId } = await params;

    const body = (await request.json()) as unknown;
    const parsed = rejectSaleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body.", parsed.error);
    }

    // Note: parsed.data.saleId is provided in the body for schema validation symmetry,
    // but the authoritative sale ID comes from the route param (saleId).
    const { reason } = parsed.data;

    // Fetch sale with items for the reversal
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
    const noteText = `Sale rejected — reason: ${reason ?? "none given"}`;

    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        // Resolve the Inventory row for this sale item
        const invWhere = {
          branchId: sale.branchId,
          ...(item.categoryId
            ? { categoryId: item.categoryId }
            : item.productId
            ? { productId: item.productId }
            : { productVariantId: item.productVariantId }),
        };

        const currentInv = await tx.inventory.findFirst({ where: invWhere });

        if (!currentInv) {
          // Item's inventory row is missing — skip reversal for this item
          // (shouldn't happen in normal operation, but defend against orphaned items)
          continue;
        }

        // Guard: reference snapshot rows must not be mutated — they represent a
        // historical point-in-time view of a node before it was drilled down.
        // Attempting to auto-reverse against a snapshot would silently corrupt
        // the historical record. Fail loudly so the owner can manually correct.
        if (currentInv.isReferenceSnapshot) {
          throw new ValidationError(
            "This item's stock tracking has changed since this sale was logged and can no longer " +
              "be automatically reversed. Please adjust inventory manually via a stock count and " +
              "contact support if needed."
          );
        }

        const quantityBefore = currentInv.quantity;
        // Reversal: add the sold quantity back.
        // Math is correct regardless of sign — if quantity was already negative due to
        // an oversell, addition brings it closer to zero as expected. No special handling needed.
        const quantityAfter = quantityBefore + item.quantity;

        await tx.inventory.update({
          where: { id: currentInv.id },
          data: { quantity: quantityAfter },
        });

        // A09: reversal is a NEW ADJUSTMENT StockMovement — never edits the original SALE row
        await tx.stockMovement.create({
          data: {
            branchId: sale.branchId,
            categoryId: item.categoryId ?? null,
            productId: item.productId ?? null,
            productVariantId: item.productVariantId ?? null,
            type: "ADJUSTMENT",
            quantityBefore,
            quantityAfter,
            quantityDelta: item.quantity, // positive — reversing the original negative SALE delta
            note: noteText,
            saleId,
            performedById: session.user.id,
          },
        });
      }

      // Update sale status
      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: "REJECTED",
          rejectionReason: reason ?? null,
          reviewedById: session.user.id,
          reviewedAt: now,
        },
      });

      // A09: audit log
      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: sale.loggedById,
          action: "SALE_REJECTED",
          details: { saleId, reason: reason ?? null, branchId: sale.branchId },
        },
      });
    });

    // Notify the staff member who logged the sale (outside transaction — best-effort)
    await createNotification({
      userId: sale.loggedById,
      type: "SALE_REJECTED",
      title: "A sale you logged was rejected",
      body: reason
        ? `A sale you logged was rejected. Reason: ${reason}`
        : "A sale you logged was rejected. No reason was provided.",
      linkUrl: "/dashboard/sales?status=REJECTED",
      relatedSaleId: saleId,
    });

    return Response.json({ success: true, saleId }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
