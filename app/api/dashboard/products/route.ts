// app/api/dashboard/products/route.ts
// API endpoints for retrieving products (with variants and current-stock inventory records) and creating new products.

import { prisma } from "@/lib/prisma";
import { requireSession, requireRole, requireBranchAccess, getAccessibleBranchIds } from "@/lib/authz";
import { handleApiError, ValidationError } from "@/lib/errors";
import { productWithVariantsSchema } from "@/lib/validations/product";
import { generateUniqueSlug } from "@/lib/generate-slug";
import { getProductStockBearingLevel } from "@/lib/category-tree";
import type { ProductWithRelations, CategoryWithRelations } from "@/types";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// GET /api/dashboard/products
// ---------------------------------------------------------------------------
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const search = searchParams.get("search") || undefined;
    const branchId = searchParams.get("branchId") || undefined;

    // Resolve branch filtering rules
    let branchFilter: { in: string[] } | undefined;
    if (branchId) {
      await requireBranchAccess(session.user.id, branchId);
      branchFilter = { in: [branchId] };
    } else {
      if (session.user.role !== "OWNER") {
        const accessibleBranchIds = await getAccessibleBranchIds(session);
        branchFilter = { in: accessibleBranchIds };
      }
      // If OWNER and branchId is omitted, branchFilter remains undefined to query all branches.
    }

    const whereClause: Prisma.ProductWhereInput = {};
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }
    if (search) {
      whereClause.name = {
        contains: search,
        mode: "insensitive",
      };
    }
    // When a specific branch is selected, only return products that actually have
    // inventory records in that branch (either product-level or via a variant).
    // Without this filter the list always shows all products regardless of branch
    // because the branch filter was only scoping the *included* inventory records.
    if (branchFilter) {
      whereClause.OR = [
        { inventoryRecords: { some: { branchId: { in: branchFilter.in } } } },
        { variants: { some: { inventoryRecords: { some: { branchId: { in: branchFilter.in } } } } } },
      ];
    }

    const dbProducts = await prisma.product.findMany({
      where: whereClause,
      include: {
        category: true,
        variants: {
          include: {
            inventoryRecords: {
              where: {
                isReferenceSnapshot: false,
                ...(branchFilter ? { branchId: branchFilter } : {}),
              },
            },
          },
        },
        inventoryRecords: {
          where: {
            isReferenceSnapshot: false,
            ...(branchFilter ? { branchId: branchFilter } : {}),
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const allCategories = (await prisma.category.findMany()) as CategoryWithRelations[];

    // Map each product to append the computed stockBearingLevel
    const products: ProductWithRelations[] = dbProducts.map((p) => {
      const pWithR = p as unknown as ProductWithRelations;
      return {
        ...pWithR,
        stockBearingLevel: getProductStockBearingLevel(pWithR, allCategories),
      };
    });

    return Response.json(products, { status: 200 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}

// ---------------------------------------------------------------------------
// POST /api/dashboard/products
// ---------------------------------------------------------------------------
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    await requireRole(session, ["OWNER", "BRANCH_MANAGER"]);

    const body = (await request.json()) as unknown;
    const parsed = productWithVariantsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError("Invalid product input", parsed.error);
    }

    const { name, description, brand, tags, categoryId, isActive, images, variants } = parsed.data;

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new ValidationError("The selected category does not exist.");
    }

    const slug = await generateUniqueSlug(name, async (s) => {
      const existing = await prisma.product.findUnique({
        where: { slug: s },
        select: { id: true },
      });
      return !!existing;
    });

    // Run the creation in a transaction
    const newProduct = await prisma.$transaction(async (tx) => {
      // 1. Create the Product row. Defaults to isStockBearing: false.
      const product = await tx.product.create({
        data: {
          name,
          slug,
          description: description || null,
          brand: brand || null,
          tags: tags || [],
          categoryId,
          isActive,
          isStockBearing: false, // catalogue setup is separate from stock configuration
          images: images || [],
        },
      });

      // 2. If variants are provided, create them.
      if (variants && variants.length > 0) {
        const activeBranches = await tx.branch.findMany({
          where: { isActive: true },
          select: { id: true },
        });

        for (const variantData of variants) {
          const createdVariant = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku: variantData.sku || null,
              size: variantData.size || null,
              colour: variantData.colour || null,
              brand: variantData.brand || null,
              costPrice: variantData.costPrice !== undefined && variantData.costPrice !== null ? new Prisma.Decimal(variantData.costPrice) : null,
              sellingPrice: variantData.sellingPrice !== undefined && variantData.sellingPrice !== null ? new Prisma.Decimal(variantData.sellingPrice) : null,
              isActive: variantData.isActive,
            },
          });

          // 3. EXCEPTION to "no inventory at creation" rule:
          // Since product variants are implicitly stock-bearing (per Stage 1 granularity model),
          // we must create their Inventory rows (quantity 0) for every active branch within the transaction.
          // Cross-reference: Stage 4 Commit 3 Step 3 design decision.
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

      return product;
    });

    return Response.json(newProduct, { status: 201 });
  } catch (error: unknown) {
    const { body, status } = handleApiError(error);
    return Response.json(body, { status });
  }
}
