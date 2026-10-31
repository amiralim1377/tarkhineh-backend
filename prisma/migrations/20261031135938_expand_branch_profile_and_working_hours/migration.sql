/*
  Warnings:

  - You are about to drop the column `name` on the `Branch` table. All the data in the column will be lost.
  - You are about to drop the column `altText` on the `BranchImage` table. All the data in the column will be lost.
  - Added the required column `addressFa` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cityFa` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `countryCode` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameFa` to the `Branch` table without a default value. This is not possible if the table is not empty.
  - Added the required column `timeZoneId` to the `Branch` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('SATURDAY', 'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- AlterTable
ALTER TABLE "Branch" DROP COLUMN "name",
ADD COLUMN     "addressEn" TEXT,
ADD COLUMN     "addressFa" TEXT NOT NULL,
ADD COLUMN     "cityEn" TEXT,
ADD COLUMN     "cityFa" TEXT NOT NULL,
ADD COLUMN     "countryCode" VARCHAR(2) NOT NULL,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "nameFa" TEXT NOT NULL,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "timeZoneId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "BranchImage" DROP COLUMN "altText",
ADD COLUMN     "altTextEn" TEXT,
ADD COLUMN     "altTextFa" TEXT;

-- CreateTable
CREATE TABLE "BranchWorkingDay" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "dayOfWeek" "WeekDay" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchWorkingDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchWorkingPeriod" (
    "id" TEXT NOT NULL,
    "workingDayId" TEXT NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "endsNextDay" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BranchWorkingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchWorkingDay_branchId_dayOfWeek_key" ON "BranchWorkingDay"("branchId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BranchWorkingPeriod_workingDayId_startMinute_idx" ON "BranchWorkingPeriod"("workingDayId", "startMinute");

-- CreateIndex
CREATE INDEX "Branch_cityFa_idx" ON "Branch"("cityFa");

-- AddForeignKey
ALTER TABLE "BranchWorkingDay" ADD CONSTRAINT "BranchWorkingDay_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchWorkingPeriod" ADD CONSTRAINT "BranchWorkingPeriod_workingDayId_fkey" FOREIGN KEY ("workingDayId") REFERENCES "BranchWorkingDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
