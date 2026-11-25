-- CreateEnum
CREATE TYPE "MenuCategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MenuItemStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BranchMenuItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "BranchMenuItemAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "imageId" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MenuCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionFa" TEXT,
    "descriptionEn" TEXT,
    "imageId" TEXT,
    "basePrice" BIGINT NOT NULL,
    "status" "MenuItemStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemCategory" (
    "organizationId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItemCategory_pkey" PRIMARY KEY ("menuItemId","categoryId")
);

-- CreateTable
CREATE TABLE "BranchMenuItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "priceOverride" BIGINT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "BranchMenuItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "availability" "BranchMenuItemAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MenuCategory_organizationId_status_displayOrder_idx" ON "MenuCategory"("organizationId", "status", "displayOrder");

-- CreateIndex
CREATE INDEX "MenuCategory_organizationId_nameFa_idx" ON "MenuCategory"("organizationId", "nameFa");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_id_organizationId_key" ON "MenuCategory"("id", "organizationId");

-- CreateIndex
CREATE INDEX "MenuItem_organizationId_status_idx" ON "MenuItem"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MenuItem_organizationId_nameFa_idx" ON "MenuItem"("organizationId", "nameFa");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_id_organizationId_key" ON "MenuItem"("id", "organizationId");

-- CreateIndex
CREATE INDEX "MenuItemCategory_menuItemId_organizationId_idx" ON "MenuItemCategory"("menuItemId", "organizationId");

-- CreateIndex
CREATE INDEX "MenuItemCategory_categoryId_organizationId_displayOrder_idx" ON "MenuItemCategory"("categoryId", "organizationId", "displayOrder");

-- CreateIndex
CREATE INDEX "BranchMenuItem_branchId_organizationId_status_availability__idx" ON "BranchMenuItem"("branchId", "organizationId", "status", "availability", "displayOrder");

-- CreateIndex
CREATE INDEX "BranchMenuItem_menuItemId_organizationId_idx" ON "BranchMenuItem"("menuItemId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMenuItem_branchId_menuItemId_key" ON "BranchMenuItem"("branchId", "menuItemId");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemCategory" ADD CONSTRAINT "MenuItemCategory_menuItemId_organizationId_fkey" FOREIGN KEY ("menuItemId", "organizationId") REFERENCES "MenuItem"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemCategory" ADD CONSTRAINT "MenuItemCategory_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "MenuCategory"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItem" ADD CONSTRAINT "BranchMenuItem_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMenuItem" ADD CONSTRAINT "BranchMenuItem_menuItemId_organizationId_fkey" FOREIGN KEY ("menuItemId", "organizationId") REFERENCES "MenuItem"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
