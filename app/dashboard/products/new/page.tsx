// app/dashboard/products/new/page.tsx
// Server Component representing the Product Creation Page.

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/dashboard/product-form";
import type { CategoryWithRelations } from "@/types";

export const metadata: Metadata = {
  title: "Add Product | Intense Reload",
  description: "Add a new product to the catalogue, configure variants, and set up branch-level inventory tracking.",
};

export default async function NewProductPage() {
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

  // Role Access: OWNER or BRANCH_MANAGER only can create products
  if (user.role !== "OWNER" && user.role !== "BRANCH_MANAGER") {
    redirect("/dashboard/products");
  }

  // Fetch categories for category dropdown selection
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
          Create Product
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure details, variants, image assets, and stock tracking preferences.
        </p>
      </div>

      <div className="rounded-3xl border bg-card p-6 shadow-sm">
        <ProductForm
          categories={categories}
          enableStockValueTracking={enableStockValueTracking}
        />
      </div>
    </div>
  );
}
