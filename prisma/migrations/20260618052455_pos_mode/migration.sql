/*
  Warnings:

  - A unique constraint covering the columns `[receiptNumber]` on the table `Sale` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA', 'CARD');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerName" VARCHAR(100),
ADD COLUMN     "customerPhone" VARCHAR(20),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "receiptNumber" TEXT;

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY ("branchId","date")
);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_receiptNumber_key" ON "Sale"("receiptNumber");

-- AddForeignKey
ALTER TABLE "ReceiptSequence" ADD CONSTRAINT "ReceiptSequence_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
