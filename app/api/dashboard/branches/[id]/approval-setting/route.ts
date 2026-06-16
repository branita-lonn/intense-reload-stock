// app/api/dashboard/branches/[id]/approval-setting/route.ts
// PUT endpoint: updates the per-branch sale approval override. OWNER only.
// null = inherit from StoreSettings, true = always require, false = never require.

import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Changing how a branch operates is an owner-level decision, consistent with
// the reasoning for isStockBearing toggles elsewhere in the system.
const approvalSettingSchema = z.object({
  requireSaleApprovalOverride: z.boolean().nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const { id: branchId } = await params;

    const body = (await request.json()) as unknown;
    const parsed = approvalSettingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body.", parsed.error);
    }

    const { requireSaleApprovalOverride } = parsed.data;

    // Verify branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundError("Branch not found.");
    }

    const updated = await prisma.branch.update({
      where: { id: branchId },
      data: { requireSaleApprovalOverride },
      select: {
        id: true,
        name: true,
        requireSaleApprovalOverride: true,
      },
    });

    return Response.json({ branch: updated }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
