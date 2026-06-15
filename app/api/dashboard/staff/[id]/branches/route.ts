// app/api/dashboard/staff/[id]/branches/route.ts
// POST: assign a branch to a staff member. DELETE: unassign a branch.
// Both operations write UserActivityLog entries.
//
// NOTE on the DELETE here: this DELETE removes a UserBranchAssignment join row.
// It does NOT violate the "no delete" rule — that rule applies exclusively to
// UserActivityLog rows (OWASP A09). Join table rows such as UserBranchAssignment
// are legitimate targets for deletion to support unassignment workflows.

import { prisma } from "@/lib/prisma";
import {
  requireSession,
  requireRole,
  getAccessibleBranchIds,
} from "@/lib/authz";
import {
  handleApiError,
  ValidationError,
  AuthorizationError,
  NotFoundError,
} from "@/lib/errors";
import { assignBranchSchema } from "@/lib/validations/user";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);
    const { id: userId } = await params;

    const body = (await request.json()) as unknown;
    const parsed = assignBranchSchema.safeParse({
      ...((body as Record<string, unknown>) ?? {}),
      userId,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const { branchId } = parsed.data;

    // BRANCH_MANAGER can only assign branches they themselves manage
    if (session.user.role === "BRANCH_MANAGER") {
      const accessibleBranchIds = await getAccessibleBranchIds(session);
      if (!accessibleBranchIds.includes(branchId)) {
        throw new AuthorizationError(
          "You can only assign staff to branches you manage."
        );
      }
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!targetUser) throw new NotFoundError("User not found.");

    // Verify branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true },
    });
    if (!branch) throw new NotFoundError("Branch not found.");

    const assignment = await prisma.$transaction(async (tx) => {
      const newAssignment = await tx.userBranchAssignment.create({
        data: { userId, branchId },
      });

      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: userId,
          action: "BRANCH_ASSIGNED",
          details: { branchId },
        },
      });

      return newAssignment;
    });

    return Response.json(assignment, { status: 201 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);
    const { id: userId } = await params;

    const body = (await request.json()) as unknown;
    const parsed = assignBranchSchema.safeParse({
      ...((body as Record<string, unknown>) ?? {}),
      userId,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const { branchId } = parsed.data;

    // BRANCH_MANAGER can only unassign from branches they manage
    if (session.user.role === "BRANCH_MANAGER") {
      const accessibleBranchIds = await getAccessibleBranchIds(session);
      if (!accessibleBranchIds.includes(branchId)) {
        throw new AuthorizationError(
          "You can only manage staff for branches you are assigned to."
        );
      }
    }

    const existing = await prisma.userBranchAssignment.findUnique({
      where: { userId_branchId: { userId, branchId } },
    });
    if (!existing) throw new NotFoundError("Branch assignment not found.");

    await prisma.$transaction(async (tx) => {
      await tx.userBranchAssignment.delete({
        where: { userId_branchId: { userId, branchId } },
      });

      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: userId,
          action: "BRANCH_UNASSIGNED",
          details: { branchId },
        },
      });
    });

    return Response.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
