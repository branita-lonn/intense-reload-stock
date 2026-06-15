// app/api/dashboard/products/stock-bearing/route.ts
// API endpoint for enabling or disabling stock tracking on a specific product.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { toggleProductStockBearingSchema } from "@/lib/validations/product";
import { canProductBeStockBearing } from "@/lib/category-tree";
import type { ProductWithRelations, CategoryWithRelations } from "@/types";

// ---------------------------------------------------------------------------
// POST /api/dashboard/products/stock-bearing
// ---------------------------------------------------------------------------
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    // OWNER-only endpoint for stock-bearing configuration changes,
    // consistent with category stock-bearing configuration permissions.
    await requireRole(session, ["OWNER"]);

    const body = (await request.json()) as unknown;
    const parsed = toggleProductStockBearingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid stock-bearing toggle input", parsed.error);
    }

    const { productId, enable } = parsed.data;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
        variants: {
          include: {
            inventoryRecords: true,
          },
        },
        inventoryRecords: true,
      },
    });

    if (!product) {
      throw new NotFoundError("Product not found.");
    }

    const allCategories = (await prisma.category.findMany()) as CategoryWithRelations[];

    if (enable) {
      // 1. Check if product can be stock-bearing (conflict check against category and variants)
      const checkResult = canProductBeStockBearing(
        product as unknown as ProductWithRelations,
        allCategories
      );

      if (!checkResult.allowed) {
        throw new ValidationError(checkResult.reason ?? "Product cannot be stock bearing.");
      }

      // 2. Perform updates and inventory creations within a transaction
      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: { isStockBearing: true },
        });

        const activeBranches = await tx.branch.findMany({
          where: { isActive: true },
          select: { id: true },
        });

        for (const branch of activeBranches) {
          const existing = await tx.inventory.findUnique({
            where: {
              branchId_productId: {
                branchId: branch.id,
                productId: productId,
              },
            },
          });

          if (!existing) {
            await tx.inventory.create({
              data: {
                branchId: branch.id,
                productId: productId,
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

      return Response.json(
        { message: "Stock tracking enabled successfully for this product." },
        { status: 200 }
      );
    } else {
      // Logic for disabling stock-bearing
      const activeInventoryWithStock = product.inventoryRecords.filter(
        (ir) => !ir.isReferenceSnapshot && ir.quantity > 0
      );

      if (activeInventoryWithStock.length > 0) {
        throw new ValidationError(
          "This product currently holds stock. Reduce it to zero via a stock count before disabling tracking, or add variants to track it in more detail."
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: productId },
          data: { isStockBearing: false },
        });

        await tx.inventory.updateMany({
          where: {
            productId: productId,
            isReferenceSnapshot: false,
          },
          data: {
            isReferenceSnapshot: true,
            snapshotLabel: "Tracking disabled — final quantity was 0",
          },
        });
      });

      return Response.json(
        { message: "Stock tracking disabled successfully for this product." },
        { status: 200 }
      );
    }
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
