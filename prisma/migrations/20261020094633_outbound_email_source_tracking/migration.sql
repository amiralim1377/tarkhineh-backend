-- AlterTable
ALTER TABLE "OutboundEmailMessage" ADD COLUMN     "aggregateId" TEXT,
ADD COLUMN     "aggregateType" TEXT;

-- CreateIndex
CREATE INDEX "OutboundEmailMessage_aggregateType_aggregateId_status_idx" ON "OutboundEmailMessage"("aggregateType", "aggregateId", "status");
