/*
  Warnings:

  - You are about to drop the column `csrfTokenHash` on the `AuthSession` table. All the data in the column will be lost.
  - Added the required column `csrfTokenHash` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AuthSession" DROP COLUMN "csrfTokenHash";

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "csrfTokenHash" TEXT NOT NULL;
