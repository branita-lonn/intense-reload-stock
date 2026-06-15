// app/api/dashboard/staff/route.ts
// API endpoints for listing and creating staff accounts.

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
} from "@/lib/errors";
import { createStaffSchema } from "@/lib/validations/user";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    let users;

    if (session.user.role === "OWNER") {
      // OWNER sees all non-OWNER staff
      users = await prisma.user.findMany({
        where: { role: { not: "OWNER" } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          branchAssignments: {
            select: {
              id: true,
              branchId: true,
              branch: { select: { id: true, name: true, isActive: true } },
              createdAt: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });
    } else {
      // BRANCH_MANAGER sees only staff in their accessible branches
      const accessibleBranchIds = await getAccessibleBranchIds(session);
      users = await prisma.user.findMany({
        where: {
          role: { not: "OWNER" },
          branchAssignments: {
            some: { branchId: { in: accessibleBranchIds } },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          branchAssignments: {
            where: { branchId: { in: accessibleBranchIds } },
            select: {
              id: true,
              branchId: true,
              branch: { select: { id: true, name: true, isActive: true } },
              createdAt: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });
    }

    return Response.json(users, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const body = (await request.json()) as unknown;
    const parsed = createStaffSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const { name, email, role, branchIds, temporaryPassword } = parsed.data;

    // BRANCH_MANAGER can only assign branches they themselves manage
    if (session.user.role === "BRANCH_MANAGER") {
      const accessibleBranchIds = await getAccessibleBranchIds(session);
      const unauthorisedBranch = branchIds.find(
        (id) => !accessibleBranchIds.includes(id)
      );
      if (unauthorisedBranch) {
        throw new AuthorizationError(
          "You can only assign staff to branches you manage."
        );
      }
    }

    // Check email uniqueness before attempting create
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError("A user with this email already exists.");
    }

    // Hash temporary password — bcryptjs, 12 salt rounds (OWASP A02)
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    // Create user + branch assignments in a single transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          role,
          password: hashedPassword,
          mustChangePassword: true, // Force password change on first login (OWASP A07)
          branchAssignments: {
            create: branchIds.map((branchId) => ({ branchId })),
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          mustChangePassword: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Write UserActivityLog entry (append-only, OWASP A09)
      await tx.userActivityLog.create({
        data: {
          actorId: session.user.id,
          targetUserId: user.id,
          action: "ACCOUNT_CREATED",
          details: { role, branchIds },
        },
      });

      return user;
    });

    // This is the ONLY time the plaintext temporary password is available anywhere.
    // It is never stored, logged, or retrievable again.
    // The UI must display it in a "copy this now" style component.
    return Response.json(
      { ...newUser, temporaryPassword },
      { status: 201 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
