// app/api/dashboard/branches/[id]/route.ts
// API endpoints for individual branch operations (read, edit).

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, requireBranchAccess } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { branchUpdateSchema } from "@/lib/validations/branch";
import { Prisma } from "@prisma/client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    await requireBranchAccess(session.user.id, id);

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        userAssignments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
                createdAt: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundError("Branch not found.");
    }

    return Response.json(branch, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);
    const { id } = await params;

    // Verify branch exists before updating
    const branchExists = await prisma.branch.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!branchExists) {
      throw new NotFoundError("Branch not found.");
    }

    const body = (await request.json()) as unknown;
    const parsed = branchUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const updateData: Prisma.BranchUpdateInput = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (parsed.data.town !== undefined) updateData.town = parsed.data.town;
    if (parsed.data.address !== undefined) {
      updateData.address = parsed.data.address || null;
    }
    if (parsed.data.contactNumber !== undefined) {
      updateData.contactNumber = parsed.data.contactNumber || null;
    }
    if (parsed.data.isActive !== undefined) {
      updateData.isActive = parsed.data.isActive;
    }

    // TODO: A future stage may want to prevent deactivation if the branch has pending sales/transfers
    const updatedBranch = await prisma.branch.update({
      where: { id },
      data: updateData,
    });

    return Response.json(updatedBranch, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
