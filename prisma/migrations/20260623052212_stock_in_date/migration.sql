-- AlterEnum
ALTER TYPE "UserActivityAction" ADD VALUE 'STOCK_IN_DATE_EDITED';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "stockInDate" TIMESTAMP(3);
