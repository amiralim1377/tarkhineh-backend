/*
  Warnings:

  - You are about to drop the `EmailOutboxMessage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "EmailOutboxMessage" DROP CONSTRAINT "EmailOutboxMessage_challengeId_fkey";

-- DropTable
DROP TABLE "EmailOutboxMessage";

-- DropEnum
DROP TYPE "EmailOutboxStatus";
