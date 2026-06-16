// app/api/dashboard/sales/[id]/approve/route.ts
// POST endpoint: approves a single PENDING sale. OWNER/BRANCH_MANAGER only.
// NOTE: Approval does NOT change Inventory.quantity — the decrement happened at
// logging time (Stage 5). Approval is a status change only. This is intentional
// by design: approval is an audit checkpoint, not an inventory gate.

import { requireSession, requireBranchAccess, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const { id: saleId } = await params;

    // Fetch the sale to verify it exists and get its branchId
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { id: true, branchId: true, status: true, loggedById: true },
    });

    if (!sale) {
      throw new NotFoundError("Sale not found.");
    }

    // Branch-scoped access check — never trust a branchId from the request body
    await requireBranchAccess(session.user.id, sale.branchId);

    if (sale.status !== "PENDING") {
      throw new ValidationError("This sale has already been reviewed.");
    }

    const now = new Date();

    // Update sale status + write audit log in a transaction
    const updatedSale = await prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: "APPROVED",
          reviewedById: session.user.id,
          reviewedAt: now,
        },
      });

      // A09: Append-only audit trail — one entry per approve action.
      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: sale.loggedById,
          action: "SALE_APPROVED",
          details: { saleId, branchId: sale.branchId },
        },
      });

      return updated;
    });

    return Response.json({ sale: updatedSale }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
