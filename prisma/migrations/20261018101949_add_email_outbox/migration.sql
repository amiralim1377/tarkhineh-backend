-- CreateEnum
CREATE TYPE "EmailOutboxStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DEAD', 'CANCELLED');

-- CreateTable
CREATE TABLE "EmailOutboxMessage" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "encryptedToken" TEXT,
    "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enqueuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailOutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailOutboxMessage_challengeId_key" ON "EmailOutboxMessage"("challengeId");

-- CreateIndex
CREATE INDEX "EmailOutboxMessage_status_availableAt_idx" ON "EmailOutboxMessage"("status", "availableAt");

-- AddForeignKey
ALTER TABLE "EmailOutboxMessage" ADD CONSTRAINT "EmailOutboxMessage_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "EmailVerificationChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
