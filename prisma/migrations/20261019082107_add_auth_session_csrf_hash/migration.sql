/*
  Warnings:

  - Added the required column `csrfTokenHash` to the `AuthSession` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AuthSession" ADD COLUMN     "csrfTokenHash" TEXT NOT NULL;
