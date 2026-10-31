/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,slug]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Branch_slug_key";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "BranchImage" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchImage_branchId_sortOrder_idx" ON "BranchImage"("branchId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_organizationId_slug_key" ON "Branch"("organizationId", "slug");

-- AddForeignKey
ALTER TABLE "BranchImage" ADD CONSTRAINT "BranchImage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
