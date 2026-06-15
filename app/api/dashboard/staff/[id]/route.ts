// app/api/dashboard/staff/[id]/route.ts
// PUT (role change, OWNER only) and PATCH (activate/deactivate, OWNER/BRANCH_MANAGER).
// No DELETE route — staff accounts are deactivated, never deleted,
// to preserve StockMovement.performedById referential integrity and accountability.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import {
  handleApiError,
  ValidationError,
  NotFoundError,
} from "@/lib/errors";
import { updateUserRoleSchema } from "@/lib/validations/user";
import { z } from "zod";

const toggleActiveSchema = z.object({
  isActive: z.boolean({ error: "isActive (boolean) is required." }),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    // Role changes are OWNER-only — branch managers cannot promote/demote
    await requireRole(session, ["OWNER"]);
    const { id } = await params;

    const body = (await request.json()) as unknown;
    const parsed = updateUserRoleSchema.safeParse({ ...((body as Record<string, unknown>) ?? {}), userId: id });
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!targetUser) throw new NotFoundError("User not found.");

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { role: parsed.data.newRole },
        select: { id: true, name: true, email: true, role: true },
      });

      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: id,
          action: "ROLE_CHANGED",
          details: {
            previousRole: targetUser.role,
            newRole: parsed.data.newRole,
          },
        },
      });

      return user;
    });

    return Response.json(updatedUser, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);
    const { id } = await params;

    const body = (await request.json()) as unknown;
    const parsed = toggleActiveSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!targetUser) throw new NotFoundError("User not found.");

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { isActive: parsed.data.isActive },
        select: { id: true, name: true, email: true, isActive: true },
      });

      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: id,
          action: parsed.data.isActive
            ? "ACCOUNT_REACTIVATED"
            : "ACCOUNT_DEACTIVATED",
        },
      });

      return user;
    });

    return Response.json(updatedUser, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
