-- CreateEnum
CREATE TYPE "OutboundEmailLane" AS ENUM ('TRANSACTIONAL', 'BULK');

-- CreateEnum
CREATE TYPE "OutboundEmailStatus" AS ENUM ('PENDING', 'DISPATCHING', 'QUEUED', 'PROCESSING', 'SENT', 'DEAD', 'CANCELLED');

-- CreateTable
CREATE TABLE "OutboundEmailMessage" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "lane" "OutboundEmailLane" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "payloadVersion" INTEGER NOT NULL DEFAULT 1,
    "encryptedPayload" TEXT,
    "status" "OutboundEmailStatus" NOT NULL DEFAULT 'PENDING',
    "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "enqueuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundEmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmailMessage_idempotencyKey_key" ON "OutboundEmailMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboundEmailMessage_lane_status_availableAt_createdAt_idx" ON "OutboundEmailMessage"("lane", "status", "availableAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundEmailMessage_status_lockedUntil_idx" ON "OutboundEmailMessage"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "OutboundEmailMessage_status_enqueuedAt_idx" ON "OutboundEmailMessage"("status", "enqueuedAt");
