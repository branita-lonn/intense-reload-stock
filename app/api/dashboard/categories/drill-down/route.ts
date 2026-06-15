// app/api/dashboard/categories/drill-down/route.ts
// API endpoint to execute the category drill-down stock migration flow.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { drillDownSchema } from "@/lib/validations/category";
import { hasStockBearingDescendant } from "@/lib/category-tree";

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);

    const body = (await request.json()) as unknown;
    const parsed = drillDownSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid drill-down input", parsed.error);
    }

    const { parentCategoryId, childCategoryIds } = parsed.data;

    // Fetch categories and validate the parent-child relationship
    const allCategories = await prisma.category.findMany();
    const parentCategory = allCategories.find((c) => c.id === parentCategoryId);
    if (!parentCategory) {
      throw new ValidationError("Parent category not found.");
    }

    if (!parentCategory.isStockBearing) {
      throw new ValidationError("Parent category is not currently stock-bearing.");
    }

    const directChildren = allCategories.filter((c) => c.parentId === parentCategoryId);
    const directChildIds = directChildren.map((c) => c.id);

    // Verify all requested child IDs are direct children of the parent
    for (const childId of childCategoryIds) {
      if (!directChildIds.includes(childId)) {
        throw new ValidationError(`Category ID '${childId}' is not a direct subcategory of '${parentCategory.name}'.`);
      }
    }

    // Treat drill-down as parent stock redistributing into all direct children to prevent orphans.
    const allDirectChildIds = directChildIds;

    // Verify none of the target child categories already track stock in their subtree
    for (const childId of allDirectChildIds) {
      const child = allCategories.find((c) => c.id === childId);
      const childName = child ? child.name : "Subcategory";
      if (hasStockBearingDescendant(childId, allCategories)) {
        throw new ValidationError(
          `Cannot drill down: child category '${childName}' already has subcategories tracking stock.`
        );
      }
    }

    // Fetch parent category's current active inventory quantities
    const parentInventory = await prisma.inventory.findMany({
      where: {
        categoryId: parentCategoryId,
        isReferenceSnapshot: false,
      },
      include: {
        branch: {
          select: {
            name: true,
          },
        },
      },
    });

    const parentQuantities = parentInventory.map((inv) => ({
      branchId: inv.branchId,
      branchName: inv.branch.name,
      quantity: inv.quantity,
    }));

    const childNamesStr = directChildren.map((c) => c.name).join(", ");
    const dateStr = new Date().toISOString();

    // Execute the state migration inside a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Convert parent inventory rows to historical reference snapshots
      for (const inv of parentInventory) {
        const label = `Previous total: ${inv.quantity} — recorded ${dateStr}, before drill-down into ${childNamesStr}`;
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            isReferenceSnapshot: true,
            snapshotLabel: label,
          },
        });
      }

      // 2. Disable stock-bearing on the parent category
      await tx.category.update({
        where: { id: parentCategoryId },
        data: { isStockBearing: false },
      });

      // 3. Enable stock-bearing and create zero-quantity inventory rows for children
      const activeBranches = await tx.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      for (const childId of allDirectChildIds) {
        await tx.category.update({
          where: { id: childId },
          data: { isStockBearing: true },
        });

        for (const branch of activeBranches) {
          const existing = await tx.inventory.findUnique({
            where: {
              branchId_categoryId: {
                branchId: branch.id,
                categoryId: childId,
              },
            },
          });

          if (!existing) {
            await tx.inventory.create({
              data: {
                branchId: branch.id,
                categoryId: childId,
                quantity: 0,
                lowStockThreshold: 5,
                isReferenceSnapshot: false,
              },
            });
          } else {
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
      }
    });

    // Construct the response payload
    const activeBranches = await prisma.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const newInventoryRows = [];
    for (const childId of allDirectChildIds) {
      const isHighlighted = childCategoryIds.includes(childId);
      const child = directChildren.find((c) => c.id === childId);
      for (const branch of activeBranches) {
        newInventoryRows.push({
          categoryId: childId,
          categoryName: child ? child.name : "Subcategory",
          branchId: branch.id,
          branchName: branch.name,
          quantity: 0,
          highlighted: isHighlighted,
        });
      }
    }

    // suggestedStockCountUrl route is implemented in Stage 7. For now it will 404.
    const suggestedStockCountUrl = `/dashboard/stock-count/new?scope=drill-down&categoryIds=${allDirectChildIds.join(
      ","
    )}`;

    return Response.json(
      {
        message: "Drill-down stock migration completed successfully.",
        parentQuantities,
        newInventoryRows,
        suggestedStockCountUrl,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
