// app/api/dashboard/products/convert-to-variants/route.ts
// API endpoint for converting a product from product-level stock tracking to variant-level stock tracking.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { convertToVariantTrackingSchema } from "@/lib/validations/product";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// POST /api/dashboard/products/convert-to-variants
// ---------------------------------------------------------------------------
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    // OWNER-only endpoint for stock configuration conversion,
    // consistent with category drill-down permissions.
    await requireRole(session, ["OWNER"]);

    const body = (await request.json()) as unknown;
    const parsed = convertToVariantTrackingSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid convert-to-variants input", parsed.error);
    }

    const { productId, initialVariants } = parsed.data;

    // Fetch the product with its variants and current active inventory records
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
        inventoryRecords: {
          where: { isReferenceSnapshot: false },
          include: {
            branch: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundError("Product not found.");
    }

    if (!product.isStockBearing) {
      throw new ValidationError("Product is not currently stock-bearing.");
    }

    if (product.variants.length > 0) {
      throw new ValidationError("Product already has variants.");
    }

    const previousQuantities = product.inventoryRecords.map((inv) => ({
      branchId: inv.branchId,
      branchName: inv.branch.name,
      quantity: inv.quantity,
    }));

    const dateStr = new Date().toISOString();
    const createdVariantIds: string[] = [];

    // Execute conversion in a single database transaction
    await prisma.$transaction(async (tx) => {
      // 1. Convert product inventory rows to historical reference snapshots
      for (const inv of product.inventoryRecords) {
        const label = `Previous total: ${inv.quantity} — recorded ${dateStr}, before converting to variant tracking`;
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            isReferenceSnapshot: true,
            snapshotLabel: label,
          },
        });
      }

      // 2. Disable product-level stock bearing flag
      await tx.product.update({
        where: { id: productId },
        data: { isStockBearing: false },
      });

      // 3. Create variants and their corresponding inventory records on all active branches
      const activeBranches = await tx.branch.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const variantData of initialVariants) {
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: productId,
            sku: variantData.sku || null,
            size: variantData.size || null,
            colour: variantData.colour || null,
            brand: variantData.brand || null,
            costPrice:
              variantData.costPrice !== undefined && variantData.costPrice !== null
                ? new Prisma.Decimal(variantData.costPrice)
                : null,
            sellingPrice:
              variantData.sellingPrice !== undefined && variantData.sellingPrice !== null
                ? new Prisma.Decimal(variantData.sellingPrice)
                : null,
            isActive: variantData.isActive,
          },
        });
        createdVariantIds.push(createdVariant.id);

        for (const branch of activeBranches) {
          const existing = await tx.inventory.findUnique({
            where: {
              branchId_productVariantId: {
                branchId: branch.id,
                productVariantId: createdVariant.id,
              },
            },
          });

          if (!existing) {
            await tx.inventory.create({
              data: {
                branchId: branch.id,
                productVariantId: createdVariant.id,
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

    // suggestedStockCountUrl route will be implemented in Stage 7. For now it will 404.
    const suggestedStockCountUrl = `/dashboard/stock-count/new?scope=variant-conversion&productId=${productId}`;

    return Response.json(
      {
        message: "Converted to variant tracking successfully.",
        previousQuantities,
        createdVariantIds,
        suggestedStockCountUrl,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
