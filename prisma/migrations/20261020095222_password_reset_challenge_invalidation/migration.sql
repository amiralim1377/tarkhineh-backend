-- DropIndex
DROP INDEX "PasswordResetChallenge_userId_consumedAt_expiresAt_idx";

-- AlterTable
ALTER TABLE "PasswordResetChallenge" ADD COLUMN     "invalidatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PasswordResetChallenge_userId_consumedAt_invalidatedAt_expi_idx" ON "PasswordResetChallenge"("userId", "consumedAt", "invalidatedAt", "expiresAt");
