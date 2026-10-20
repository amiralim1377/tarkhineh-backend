/*
  Warnings:

  - The values [SENT] on the enum `OutboundEmailStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OutboundEmailStatus_new" AS ENUM ('PENDING', 'DISPATCHING', 'QUEUED', 'PROCESSING', 'RETRY_SCHEDULED', 'OUTCOME_UNKNOWN', 'ACCEPTED', 'DEAD', 'CANCELLED', 'EXPIRED');
ALTER TABLE "public"."OutboundEmailMessage" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OutboundEmailMessage" ALTER COLUMN "status" TYPE "OutboundEmailStatus_new" USING (
  CASE "status"::text
    WHEN 'SENT' THEN 'ACCEPTED'
    ELSE "status"::text
  END
)::"OutboundEmailStatus_new";
ALTER TYPE "OutboundEmailStatus" RENAME TO "OutboundEmailStatus_old";
ALTER TYPE "OutboundEmailStatus_new" RENAME TO "OutboundEmailStatus";
DROP TYPE "public"."OutboundEmailStatus_old";
ALTER TABLE "OutboundEmailMessage" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
