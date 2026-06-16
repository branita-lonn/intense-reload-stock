// app/api/dashboard/sales/bulk-approve/route.ts
// POST endpoint: bulk-approves up to 100 PENDING sales. OWNER/BRANCH_MANAGER only.
// Returns partial-success reporting: { approved: string[], skipped: { saleId, reason }[] }.
// A request to approve sales the user lacks branch access to fails for those items
// specifically — the rest are still approved (same philosophy as Stage 4 CSV import).

import { requireSession, requireRole, userCanAccessBranch } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { approveSalesSchema } from "@/lib/validations/sale-review";
import { prisma } from "@/lib/prisma";

interface SkippedSale {
  saleId: string;
  reason: "not_pending" | "no_branch_access";
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const body = (await request.json()) as unknown;
    const parsed = approveSalesSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body.", parsed.error);
    }

    const { saleIds } = parsed.data;

    // Fetch all matching sales in one query
    const sales = await prisma.sale.findMany({
      where: { id: { in: saleIds } },
      select: { id: true, branchId: true, status: true, loggedById: true },
    });

    // Build a lookup for found sales; any saleId not found is silently skipped
    // (the ID either doesn't exist or was already deleted — both are treated as not_pending)
    const foundIds = new Set(sales.map((s) => s.id));
    const eligible: typeof sales = [];
    const skipped: SkippedSale[] = [];

    // Classify each requested sale ID
    for (const saleId of saleIds) {
      if (!foundIds.has(saleId)) {
        skipped.push({ saleId, reason: "not_pending" });
        continue;
      }

      const sale = sales.find((s) => s.id === saleId)!;

      if (sale.status !== "PENDING") {
        skipped.push({ saleId, reason: "not_pending" });
        continue;
      }

      // Check branch access per sale — branch membership can change mid-session
      const canAccess = await userCanAccessBranch(session.user.id, sale.branchId);
      if (!canAccess) {
        skipped.push({ saleId, reason: "no_branch_access" });
        continue;
      }

      eligible.push(sale);
    }

    if (eligible.length === 0) {
      return Response.json(
        { approved: [], skipped },
        { status: 200 }
      );
    }

    const now = new Date();
    const approvedIds: string[] = [];

    // Transaction: update all eligible sales + write one UserActivityLog per sale.
    // Per-sale log entries matter for Stage 9's staff-activity view — do not batch into one entry.
    await prisma.$transaction(async (tx) => {
      for (const sale of eligible) {
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            status: "APPROVED",
            reviewedById: session.user.id,
            reviewedAt: now,
          },
        });

        await tx.userActivityLog.create({
          data: {
            actorId: session.user.id,
            targetUserId: sale.loggedById,
            action: "SALE_APPROVED",
            details: { saleId: sale.id, branchId: sale.branchId },
          },
        });

        approvedIds.push(sale.id);
      }
    });

    return Response.json({ approved: approvedIds, skipped }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
