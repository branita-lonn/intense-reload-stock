-- CreateTable
CREATE TABLE "SaleItemBreakdown" (
    "id" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "productVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItemBreakdown_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SaleItemBreakdown" ADD CONSTRAINT "SaleItemBreakdown_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemBreakdown" ADD CONSTRAINT "SaleItemBreakdown_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemBreakdown" ADD CONSTRAINT "SaleItemBreakdown_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemBreakdown" ADD CONSTRAINT "SaleItemBreakdown_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
