// app/api/dashboard/categories/route.ts
// API endpoints for listing all categories and creating new categories.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { categorySchema } from "@/lib/validations/category";
import { generateUniqueSlug } from "@/lib/generate-slug";

export async function GET() {
  try {
    const session = await requireSession();
    const branchIds = await getAccessibleBranchIds(session);

    const categories = await prisma.category.findMany({
      include: {
        parent: true,
        children: true,
        _count: {
          select: { products: true },
        },
        inventoryRecords: {
          where: {
            branchId: { in: branchIds },
          },
          include: {
            branch: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    return Response.json(categories, { status: 200 });
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
    const parsed = categorySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid category input", parsed.error);
    }

    // Validate parent category exists if provided
    if (parsed.data.parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: parsed.data.parentId },
        select: { id: true },
      });
      if (!parent) {
        throw new ValidationError("Parent category does not exist.");
      }
    }

    const slug = await generateUniqueSlug(parsed.data.name, async (s) => {
      const existing = await prisma.category.findUnique({
        where: { slug: s },
        select: { id: true },
      });
      return !!existing;
    });

    const newCategory = await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        imageUrl: parsed.data.imageUrl || null,
        parentId: parsed.data.parentId || null,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
        isStockBearing: false, // Defaults to false per rules
      },
    });

    return Response.json(newCategory, { status: 201 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
