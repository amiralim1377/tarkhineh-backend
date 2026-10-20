-- AlterTable
ALTER TABLE "OutboundEmailMessage" ADD COLUMN     "lastReconciledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OutboundEmailMessage_lane_status_lastReconciledAt_enqueuedA_idx" ON "OutboundEmailMessage"("lane", "status", "lastReconciledAt", "enqueuedAt");
