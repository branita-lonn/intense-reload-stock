// app/api/dashboard/stock-in/route.ts
// Batch stock-in endpoint. All roles (OWNER, BRANCH_MANAGER, STAFF) may stock-in,
// but branch access is checked PER ITEM to prevent cross-branch payload injection.

import { requireSession, requireRole, requireBranchAccess } from "@/lib/authz";
import { getInventoryRows } from "@/lib/inventory-queries";
import { stockInBatchSchema } from "@/lib/validations/stock-in";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    // All three roles can perform stock-in — this is routine shop-floor work.
    await requireRole(session, ["OWNER", "BRANCH_MANAGER", "STAFF"]);

    const body = (await request.json()) as unknown;
    const parsed = stockInBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid stock-in payload.", parsed.error);
    }

    const { items } = parsed.data;

    // CRITICAL: check branch access per item, not once for the whole batch.
    // A malicious payload could mix branchIds the caller shouldn't access.
    for (const item of items) {
      await requireBranchAccess(session.user.id, item.branchId);
    }

    // Wrap all increments in a single transaction for atomicity.
    const results = await prisma.$transaction(async (tx) => {
      const updatedRows = [];

      for (const item of items) {
        const { branchId, quantityAdded, note, categoryId, productId, productVariantId } = item;

        // Build the polymorphic WHERE clause to locate the exact Inventory row.
        const whereClause =
          categoryId
            ? { branchId, categoryId }
            : productId
            ? { branchId, productId }
            : { branchId, productVariantId: productVariantId! };

        const inv = await tx.inventory.findFirst({ where: whereClause });

        if (!inv) {
          const label = categoryId
            ? `category ${categoryId}`
            : productId
            ? `product ${productId}`
            : `variant ${productVariantId}`;
          throw new NotFoundError(
            `No active Inventory record found for ${label} at branch ${branchId}. ` +
              `Stock-in targets must be existing stock-bearing nodes.`
          );
        }

        // Defend against a stale client trying to stock-in against a historical snapshot row.
        if (inv.isReferenceSnapshot) {
          throw new ValidationError(
            "This is a historical record and cannot be restocked directly. " +
              "Please select the current active stock entry for this item."
          );
        }

        const quantityBefore = inv.quantity;
        const quantityAfter = quantityBefore + quantityAdded;

        // Increment the Inventory row.
        await tx.inventory.update({
          where: { id: inv.id },
          data: { quantity: quantityAfter },
        });

        // Create an immutable StockMovement audit record.
        await tx.stockMovement.create({
          data: {
            branchId,
            categoryId: categoryId ?? null,
            productId: productId ?? null,
            productVariantId: productVariantId ?? null,
            type: "STOCK_IN",
            quantityBefore,
            quantityAfter,
            quantityDelta: quantityAdded, // always positive for STOCK_IN
            note: note ?? null,
            performedById: session.user.id,
          },
        });

        updatedRows.push({ inventoryId: inv.id, quantityBefore, quantityAfter, quantityDelta: quantityAdded });
      }

      return updatedRows;
    });

    // Re-fetch the affected branch IDs to return fresh InventoryRows for immediate UI refresh.
    const affectedBranchIds = [...new Set(items.map((i) => i.branchId))];
    const refreshedRows = await getInventoryRows({ branchIds: affectedBranchIds });

    return Response.json(
      {
        message: `Stock updated for ${results.length} item(s).`,
        updatedCount: results.length,
        refreshedRows,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
