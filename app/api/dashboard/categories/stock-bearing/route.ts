// app/api/dashboard/categories/stock-bearing/route.ts
// API endpoint for enabling or disabling stock tracking on a category.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { toggleStockBearingSchema } from "@/lib/validations/category";
import {
  getAncestorIds,
  getDescendantIds,
  hasStockBearingAncestor,
  hasStockBearingDescendant,
} from "@/lib/category-tree";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const body = (await request.json()) as unknown;
    const parsed = toggleStockBearingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid input", parsed.error);
    }

    const { categoryId, enable } = parsed.data;

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new ValidationError("Category not found.");
    }

    if (enable) {
      // 1. Fetch all categories to check for conflicts
      const allCategories = await prisma.category.findMany();

      // 2. Check ancestor conflict
      const hasAncestorConflict = hasStockBearingAncestor(categoryId, allCategories);
      if (hasAncestorConflict) {
        const ancestorIds = getAncestorIds(categoryId, allCategories);
        const conflictingAncestor = allCategories.find((c) => ancestorIds.includes(c.id) && c.isStockBearing);
        const ancestorName = conflictingAncestor ? conflictingAncestor.name : "An ancestor category";
        throw new ValidationError(
          `Cannot enable stock tracking here — '${ancestorName}' already tracks stock for this category and its children. Disable it there first, or use Drill Down instead.`
        );
      }

      // 3. Check descendant conflict
      const hasDescendantConflict = hasStockBearingDescendant(categoryId, allCategories);
      if (hasDescendantConflict) {
        const descendantIds = getDescendantIds(categoryId, allCategories);
        const conflictingDescendant = allCategories.find((c) => descendantIds.includes(c.id) && c.isStockBearing);
        const descendantName = conflictingDescendant ? conflictingDescendant.name : "A subcategory";
        throw new ValidationError(
          `Cannot enable stock tracking here — '${descendantName}' already tracks stock as a subcategory. Disable it there first, or use Drill Down instead.`
        );
      }

      // 4. Perform update and inventory creation within transaction
      await prisma.$transaction(async (tx) => {
        await tx.category.update({
          where: { id: categoryId },
          data: { isStockBearing: true },
        });

        const activeBranches = await tx.branch.findMany({
          where: { isActive: true },
          select: { id: true },
        });

        for (const branch of activeBranches) {
          const existing = await tx.inventory.findUnique({
            where: {
              branchId_categoryId: {
                branchId: branch.id,
                categoryId: categoryId,
              },
            },
          });

          if (!existing) {
            // Note: Inventory.createdAt serves as the record of when tracking began for this node.
            await tx.inventory.create({
              data: {
                branchId: branch.id,
                categoryId: categoryId,
                quantity: 0,
                lowStockThreshold: 5,
                isReferenceSnapshot: false,
              },
            });
          } else if (existing.isReferenceSnapshot) {
            await tx.inventory.update({
              where: { id: existing.id },
              data: {
                quantity: 0,
                lowStockThreshold: 5,
                isReferenceSnapshot: false,
                snapshotLabel: null,
              },
            });
          }
        }
      });

      return Response.json({ message: "Stock tracking enabled successfully." }, { status: 200 });
    } else {
      // Logic for enable: false
      const inventoryRows = await prisma.inventory.findMany({
        where: { categoryId },
      });

      const activeInventoryWithStock = inventoryRows.filter((r) => !r.isReferenceSnapshot && r.quantity > 0);
      if (activeInventoryWithStock.length > 0) {
        throw new ValidationError(
          "This category currently holds stock. Use 'Drill down' to redistribute it to subcategories before disabling tracking here."
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.category.update({
          where: { id: categoryId },
          data: { isStockBearing: false },
        });

        await tx.inventory.updateMany({
          where: {
            categoryId: categoryId,
            isReferenceSnapshot: false,
          },
          data: {
            isReferenceSnapshot: true,
            snapshotLabel: "Tracking disabled — final quantity was 0",
          },
        });
      });

      return Response.json({ message: "Stock tracking disabled successfully." }, { status: 200 });
    }
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
