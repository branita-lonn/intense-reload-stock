// app/api/dashboard/categories/[id]/children/route.ts
// GET /api/dashboard/categories/[id]/children
// Returns one-level-deep child nodes (sub-categories + products) for a given category.
// Used by the Stage 15 breakdown panel to list annotatable sub-items.
// Children are returned regardless of whether they are stock-bearing — breakdown is annotation-only.

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/authz";
import { handleApiError, NotFoundError } from "@/lib/errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams): Promise<Response> {
  try {
    await requireSession();

    const { id: categoryId } = await params;

    // Verify the category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, isActive: true },
    });
    if (!category) throw new NotFoundError("Category not found.");

    // Fetch direct sub-categories (one level deep)
    const subCategories = await prisma.category.findMany({
      where: { parentId: categoryId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    // Fetch direct products in this category
    const products = await prisma.product.findMany({
      where: { categoryId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const children = [
      ...subCategories.map((c) => ({
        nodeType: "CATEGORY" as const,
        nodeId: c.id,
        displayName: c.name,
      })),
      ...products.map((p) => ({
        nodeType: "PRODUCT" as const,
        nodeId: p.id,
        displayName: p.name,
      })),
    ];

    return Response.json({ children }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
