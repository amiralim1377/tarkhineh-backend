ALTER TABLE "OutboundEmailMessage"
ADD COLUMN "requestFingerprint" VARCHAR(64);

ALTER TABLE "OutboundEmailMessage"
ADD CONSTRAINT "OutboundEmailMessage_requestFingerprint_format_check"
CHECK (
  "requestFingerprint" IS NULL
  OR "requestFingerprint" ~ '^[0-9a-f]{64}$'
);