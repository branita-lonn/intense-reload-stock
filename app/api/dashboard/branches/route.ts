// app/api/dashboard/branches/route.ts
// API endpoints for listing and creating branches.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { branchSchema } from "@/lib/validations/branch";

export async function GET() {
  try {
    const session = await requireSession();
    
    let branches;
    if (session.user.role === "OWNER") {
      branches = await prisma.branch.findMany({
        include: {
          _count: {
            select: { userAssignments: true },
          },
          inventoryRecords: {
            select: { quantity: true },
          },
        },
        orderBy: { name: "asc" },
      });
    } else {
      const accessibleBranchIds = await getAccessibleBranchIds(session);
      branches = await prisma.branch.findMany({
        where: {
          id: { in: accessibleBranchIds },
        },
        include: {
          _count: {
            select: { userAssignments: true },
          },
          inventoryRecords: {
            select: { quantity: true },
          },
        },
        orderBy: { name: "asc" },
      });
    }

    const formattedBranches = branches.map((branch) => {
      const totalInventory = branch.inventoryRecords.reduce(
        (sum, inv) => sum + inv.quantity,
        0
      );
      const { inventoryRecords, ...rest } = branch;
      return {
        ...rest,
        totalInventory,
      };
    });

    return Response.json(formattedBranches, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const body = (await request.json()) as unknown;
    const parsed = branchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const newBranch = await prisma.branch.create({
      data: {
        name: parsed.data.name,
        town: parsed.data.town,
        address: parsed.data.address || null,
        contactNumber: parsed.data.contactNumber || null,
      },
    });

    return Response.json(newBranch, { status: 201 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
