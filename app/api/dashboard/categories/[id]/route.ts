// app/api/dashboard/categories/[id]/route.ts
// API endpoints for updating and deleting a specific category.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { categorySchema } from "@/lib/validations/category";
import { generateUniqueSlug } from "@/lib/generate-slug";
import {
  getDescendantIds,
  hasStockBearingDescendant,
  hasStockBearingAncestor,
} from "@/lib/category-tree";
import { type Prisma } from "@prisma/client";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(
  request: Request,
  { params }: RouteParams
) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const { id } = await params;

    const body = (await request.json()) as unknown;
    const parsed = categorySchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid category input", parsed.error);
    }

    const allCategories = await prisma.category.findMany();
    const category = allCategories.find((c) => c.id === id);
    if (!category) {
      throw new NotFoundError("Category not found.");
    }

    let slug: string | undefined;
    if (parsed.data.name && parsed.data.name !== category.name) {
      slug = await generateUniqueSlug(parsed.data.name, async (s) => {
        const existing = await prisma.category.findUnique({
          where: { slug: s },
          select: { id: true },
        });
        return !!existing && existing.id !== id;
      });
    }

    // If parentId is being changed, perform cycle and conflict checks
    if (parsed.data.parentId !== undefined && parsed.data.parentId !== category.parentId) {
      const newParentId = parsed.data.parentId;
      if (newParentId) {
        if (newParentId === id) {
          throw new ValidationError("A category cannot be its own parent.");
        }

        const descendantIds = getDescendantIds(id, allCategories);
        if (descendantIds.includes(newParentId)) {
          throw new ValidationError("A category cannot be placed under one of its own subcategories.");
        }

        const newParent = allCategories.find((c) => c.id === newParentId);
        if (!newParent) {
          throw new ValidationError("New parent category does not exist.");
        }

        // Conflict check: cannot have an ancestor and a descendant both tracking stock
        const isThisSubtreeStockBearing = category.isStockBearing || hasStockBearingDescendant(id, allCategories);
        const isNewParentPathStockBearing = newParent.isStockBearing || hasStockBearingAncestor(newParentId, allCategories);

        if (isThisSubtreeStockBearing && isNewParentPathStockBearing) {
          throw new ValidationError(
            "Cannot move category: this would create a stock-bearing conflict (an ancestor and descendant would both be stock-bearing)."
          );
        }
      }
    }

    const updateData: Prisma.CategoryUpdateInput = {};
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
    if (slug !== undefined) updateData.slug = slug;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description || null;
    if (parsed.data.imageUrl !== undefined) updateData.imageUrl = parsed.data.imageUrl || null;
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    if (parsed.data.parentId !== undefined) {
      if (parsed.data.parentId === null || parsed.data.parentId === "") {
        updateData.parent = { disconnect: true };
      } else {
        updateData.parent = { connect: { id: parsed.data.parentId } };
      }
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return Response.json(updatedCategory, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

export async function DELETE(
  request: Request,
  { params }: RouteParams
) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const { id } = await params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
            children: true,
          },
        },
        inventoryRecords: true,
      },
    });

    if (!category) {
      throw new NotFoundError("Category not found.");
    }

    if (category._count.children > 0) {
      throw new ValidationError("Cannot delete a category with subcategories. Remove or reassign them first.");
    }

    if (category._count.products > 0) {
      throw new ValidationError("Cannot delete a category with assigned products. Reassign or delete the products first.");
    }

    const activeInventory = category.inventoryRecords.filter((r) => !r.isReferenceSnapshot);
    if (category.isStockBearing || activeInventory.length > 0) {
      throw new ValidationError("Cannot delete a category that is currently tracking active stock. Disable stock tracking or drill down first.");
    }

    // Safely delete category and any related reference snapshot inventory rows within a transaction
    await prisma.$transaction([
      prisma.inventory.deleteMany({
        where: { categoryId: id },
      }),
      prisma.category.delete({
        where: { id },
      }),
    ]);

    return Response.json({ message: "Category deleted successfully." }, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
