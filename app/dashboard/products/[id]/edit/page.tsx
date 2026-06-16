// app/dashboard/products/[id]/edit/page.tsx
// Server Component representing the Product Edit Page.

import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/dashboard/product-form";
import type { CategoryWithRelations, ProductWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Edit Product | Intense Reload",
  description: "Modify product details, manage variants, and update catalogue assets.",
};

interface EditProductPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  // Live database check for account status
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  });

  if (!user?.isActive) {
    redirect("/auth/login");
  }

  // Role Access: OWNER or BRANCH_MANAGER only can edit products
  if (user.role !== "OWNER" && user.role !== "BRANCH_MANAGER") {
    redirect("/dashboard/products");
  }

  const { id } = await params;

  // Fetch product to edit with variants
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: true,
    },
  });

  if (!product) {
    notFound();
  }

  // Serialize Prisma Decimal fields to plain numbers before crossing the
  // Server → Client Component boundary. Next.js cannot serialize Decimal objects,
  // which causes a runtime crash even though TypeScript accepts the cast.
  const serializedProduct = {
    ...product,
    variants: product.variants.map((v) => ({
      ...v,
      costPrice: v.costPrice !== null ? Number(v.costPrice) : null,
      sellingPrice: v.sellingPrice !== null ? Number(v.sellingPrice) : null,
    })),
  };

  // Fetch categories for category selector
  const categories = (await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
  })) as CategoryWithRelations[];

  // Fetch store settings for the enableStockValueTracking feature flag
  const settings = await prisma.storeSettings.findFirst({
    select: { enableStockValueTracking: true },
  });

  const enableStockValueTracking = settings?.enableStockValueTracking ?? false;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
          Edit Product: {product.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Update basic catalog information and configure variants.
        </p>
      </div>

      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <ProductForm
          initialProduct={serializedProduct as unknown as ProductWithRelations}
          categories={categories}
          enableStockValueTracking={enableStockValueTracking}
        />
      </div>
    </div>
  );
}
