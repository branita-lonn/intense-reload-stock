-- CreateEnum
CREATE TYPE "UserActivityAction" AS ENUM ('ACCOUNT_CREATED', 'ROLE_CHANGED', 'BRANCH_ASSIGNED', 'BRANCH_UNASSIGNED', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED', 'PASSWORD_CHANGED');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "address" TEXT;

-- CreateTable
CREATE TABLE "UserActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "action" "UserActivityAction" NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivityLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserActivityLog" ADD CONSTRAINT "UserActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivityLog" ADD CONSTRAINT "UserActivityLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
