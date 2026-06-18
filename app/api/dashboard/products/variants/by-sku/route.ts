// app/api/dashboard/products/variants/by-sku/route.ts
// GET: Looks up a ProductVariant by SKU (case-insensitive) and returns the matching InventoryRow reference.
// Used by the barcode scanner onScan handler in Log Sale and Stock-In forms.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const skuQuerySchema = z.object({
  sku: z.string().min(1, "SKU is required").max(50, "SKU must be 50 characters or fewer").trim(),
  branchId: z.string().optional(),
});

interface VariantNodeRef {
  nodeType: "VARIANT";
  nodeId: string;
  productId: string;
  productVariantId: string;
  displayName: string;
  categoryPath: string;
  branchId: string | null;
  quantity: number | null;
}

interface ErrorResponse {
  error: string;
}

export async function GET(
  request: Request
): Promise<NextResponse<VariantNodeRef | ErrorResponse>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const raw = {
    sku: searchParams.get("sku") ?? "",
    branchId: searchParams.get("branchId") ?? undefined,
  };

  const parsed = skuQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid query parameters" },
      { status: 400 }
    );
  }

  const { sku, branchId } = parsed.data;

  // Case-insensitive SKU lookup via Prisma mode: "insensitive"
  const variant = await prisma.productVariant.findFirst({
    where: { sku: { equals: sku, mode: "insensitive" } },
    select: {
      id: true,
      sku: true,
      size: true,
      colour: true,
      product: {
        select: {
          id: true,
          name: true,
          categoryId: true,
          category: { select: { name: true, parentId: true } },
        },
      },
    },
  });

  if (!variant) {
    return NextResponse.json(
      { error: "Product not found — this label may be outdated or not in your system." },
      { status: 404 }
    );
  }

  // Build a short displayName from the variant attributes
  const variantParts = [variant.colour, variant.size].filter(Boolean).join(" ");
  const displayName = `${variant.product.name}${variantParts ? ` — ${variantParts}` : ""}`.trim();

  // Optionally fetch current quantity if branchId provided
  let quantity: number | null = null;
  let resolvedBranchId: string | null = branchId ?? null;

  if (branchId) {
    const inv = await prisma.inventory.findUnique({
      where: { branchId_productVariantId: { branchId, productVariantId: variant.id } },
      select: { quantity: true },
    });
    quantity = inv?.quantity ?? null;
  }

  return NextResponse.json({
    nodeType: "VARIANT",
    nodeId: variant.id,
    productId: variant.product.id,
    productVariantId: variant.id,
    displayName,
    categoryPath: variant.product.category.name,
    branchId: resolvedBranchId,
    quantity,
  });
}
