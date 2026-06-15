// app/api/dashboard/products/[id]/route.ts
// API endpoints for fetching, updating (PUT), toggling active status (PATCH), and deleting a specific product.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole } from "@/lib/authz";
import { handleApiError, ValidationError, NotFoundError } from "@/lib/errors";
import { productWithVariantsSchema } from "@/lib/validations/product";
import { generateUniqueSlug } from "@/lib/generate-slug";
import { getProductStockBearingLevel } from "@/lib/category-tree";
import type { ProductWithRelations, CategoryWithRelations } from "@/types";
import { Prisma } from "@prisma/client";
import { z } from "zod";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/products/[id]
// ---------------------------------------------------------------------------
export async function GET(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  try {
    await requireSession();
    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          include: {
            inventoryRecords: true,
          },
        },
        inventoryRecords: true, // edit form requires all history, including snapshots
      },
    });

    if (!product) {
      throw new NotFoundError("Product not found.");
    }

    const allCategories = (await prisma.category.findMany()) as CategoryWithRelations[];

    const productWithRelations: ProductWithRelations = {
      ...product,
      stockBearingLevel: getProductStockBearingLevel(product as unknown as ProductWithRelations, allCategories),
    } as unknown as ProductWithRelations;

    return Response.json(productWithRelations, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/dashboard/products/[id]
// ---------------------------------------------------------------------------
export async function PUT(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);
    const { id } = await params;

    const body = (await request.json()) as unknown;
    const parsed = productWithVariantsSchema.partial().safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid product input", parsed.error);
    }

    const { name, description, brand, tags, categoryId, isActive, images, variants } = parsed.data;

    const updatedProduct = await prisma.$transaction(async (tx) => {
      // 1. Fetch product and existing variants
      const product = await tx.product.findUnique({
        where: { id },
        include: {
          variants: {
            include: {
              inventoryRecords: true,
            },
          },
        },
      });

      if (!product) {
        throw new NotFoundError("Product not found.");
      }

      // 2. Perform validations & upserts if variants are provided
      if (variants !== undefined) {
        const activeBranches = await tx.branch.findMany({
          where: { isActive: true },
          select: { id: true },
        });

        const hasNewVariants = variants.length > 0;

        // Guard 1: Cannot add variants to a product that is currently stock-bearing.
        // Needs convert-to-variant-tracking flow instead.
        if (hasNewVariants && product.isStockBearing) {
          throw new ValidationError(
            "This product currently tracks its own stock. Use 'Add variants' from the inventory dashboard to convert to variant-level tracking first."
          );
        }

        // Identify variants to delete, create, and update
        const incomingIds = variants
          .map((v) => v.id)
          .filter((vId): vId is string => !!vId);
        const variantsToDelete = product.variants.filter(
          (ev) => !incomingIds.includes(ev.id)
        );

        // Guard 2: Cannot remove all variants if they hold active stock.
        if (variants.length === 0 && product.variants.length > 0) {
          const hasStock = product.variants.some((ev) =>
            ev.inventoryRecords.some(
              (ir) => !ir.isReferenceSnapshot && ir.quantity > 0
            )
          );
          if (hasStock) {
            throw new ValidationError(
              "Cannot remove all variants while they hold stock. Reduce their stock to zero via a stock count first, or contact support for a guided merge."
            );
          }
        }

        // Guard 3: Cannot delete a specific variant if it holds active stock.
        for (const vToDelete of variantsToDelete) {
          const hasStock = vToDelete.inventoryRecords.some(
            (ir) => !ir.isReferenceSnapshot && ir.quantity > 0
          );
          if (hasStock) {
            const variantLabel = [
              vToDelete.brand,
              vToDelete.size,
              vToDelete.colour,
            ]
              .filter(Boolean)
              .join(" ") || vToDelete.sku || vToDelete.id;
            throw new ValidationError(
              `Cannot remove variant "${variantLabel}" because it currently holds stock. Reduce its stock to zero first.`
            );
          }
        }

        // Perform deletions of removed variants
        for (const vToDelete of variantsToDelete) {
          // Delete variant inventory first
          await tx.inventory.deleteMany({
            where: { productVariantId: vToDelete.id },
          });
          // Delete variant
          await tx.productVariant.delete({
            where: { id: vToDelete.id },
          });
        }

        // Perform upserts/updates for remaining variants
        for (const variantData of variants) {
          if (variantData.id) {
            // Update existing
            await tx.productVariant.update({
              where: { id: variantData.id },
              data: {
                sku: variantData.sku || null,
                size: variantData.size || null,
                colour: variantData.colour || null,
                brand: variantData.brand || null,
                costPrice:
                  variantData.costPrice !== undefined &&
                  variantData.costPrice !== null
                    ? new Prisma.Decimal(variantData.costPrice)
                    : null,
                sellingPrice:
                  variantData.sellingPrice !== undefined &&
                  variantData.sellingPrice !== null
                    ? new Prisma.Decimal(variantData.sellingPrice)
                    : null,
                isActive: variantData.isActive,
              },
            });
          } else {
            // Create new variant
            const createdVariant = await tx.productVariant.create({
              data: {
                productId: id,
                sku: variantData.sku || null,
                size: variantData.size || null,
                colour: variantData.colour || null,
                brand: variantData.brand || null,
                costPrice:
                  variantData.costPrice !== undefined &&
                  variantData.costPrice !== null
                    ? new Prisma.Decimal(variantData.costPrice)
                    : null,
                sellingPrice:
                  variantData.sellingPrice !== undefined &&
                  variantData.sellingPrice !== null
                    ? new Prisma.Decimal(variantData.sellingPrice)
                    : null,
                isActive: variantData.isActive,
              },
            });

            // Create inventory for newly created variant on all active branches (implied stock-bearing)
            if (activeBranches.length > 0) {
              await tx.inventory.createMany({
                data: activeBranches.map((branch) => ({
                  branchId: branch.id,
                  productVariantId: createdVariant.id,
                  quantity: 0,
                  lowStockThreshold: 5,
                  isReferenceSnapshot: false,
                })),
              });
            }
          }
        }
      }

      // 3. Update the Product model itself
      const updateData: Prisma.ProductUpdateInput = {};
      if (name !== undefined) {
        updateData.name = name;
        if (name !== product.name) {
          const uniqueSlug = await generateUniqueSlug(name, async (s) => {
            const existing = await tx.product.findUnique({
              where: { slug: s },
              select: { id: true },
            });
            return !!existing && existing.id !== id;
          });
          updateData.slug = uniqueSlug;
        }
      }
      if (description !== undefined) updateData.description = description || null;
      if (brand !== undefined) updateData.brand = brand || null;
      if (tags !== undefined) updateData.tags = tags;
      if (categoryId !== undefined) {
        updateData.category = { connect: { id: categoryId } };
      }
      if (isActive !== undefined) updateData.isActive = isActive;
      if (images !== undefined) updateData.images = images;

      return tx.product.update({
        where: { id },
        data: updateData,
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
    });

    return Response.json(updatedProduct, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/dashboard/products/[id]
// ---------------------------------------------------------------------------
// Lightweight active status toggle endpoint used by the products list table.
export async function PATCH(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);
    const { id } = await params;

    const body = (await request.json()) as unknown;
    const patchSchema = z.object({
      isActive: z.boolean(),
    });
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid active toggle input", parsed.error);
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        isActive: parsed.data.isActive,
      },
    });

    return Response.json(updatedProduct, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/dashboard/products/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  request: Request,
  { params }: RouteParams
): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER"]);
    const { id } = await params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
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

    // Guard 1: Cannot delete if the product itself tracks stock and holds non-zero active stock
    if (product.isStockBearing) {
      const activeStock = product.inventoryRecords
        .filter((ir) => !ir.isReferenceSnapshot)
        .reduce((sum, ir) => sum + ir.quantity, 0);

      if (activeStock > 0) {
        throw new ValidationError(
          "Cannot delete a product that currently holds stock. Reduce its stock to zero first."
        );
      }
    }

    // Guard 2: Cannot delete if any variant holds non-zero active stock
    for (const variant of product.variants) {
      const activeStock = variant.inventoryRecords
        .filter((ir) => !ir.isReferenceSnapshot)
        .reduce((sum, ir) => sum + ir.quantity, 0);

      if (activeStock > 0) {
        const variantLabel = [variant.brand, variant.size, variant.colour]
          .filter(Boolean)
          .join(" ") || variant.sku || variant.id;
        throw new ValidationError(
          `Cannot delete a product that currently holds stock. Reduce stock for variant "${variantLabel}" to zero first.`
        );
      }
    }

    const variantIds = product.variants.map((v) => v.id);

    // Perform the deletions in a transaction
    await prisma.$transaction([
      // 1. Delete all associated StockMovement logs to maintain referential integrity
      prisma.stockMovement.deleteMany({
        where: {
          OR: [
            { productId: id },
            { productVariantId: { in: variantIds } },
          ],
        },
      }),
      // 2. Delete all associated Inventory records (including reference snapshots)
      prisma.inventory.deleteMany({
        where: {
          OR: [
            { productId: id },
            { productVariantId: { in: variantIds } },
          ],
        },
      }),
      // 3. Delete all associated ProductVariants
      prisma.productVariant.deleteMany({
        where: { productId: id },
      }),
      // 4. Finally, delete the Product
      prisma.product.delete({
        where: { id },
      }),
    ]);

    return Response.json(
      { message: "Product deleted successfully." },
      { status: 200 }
    );
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
