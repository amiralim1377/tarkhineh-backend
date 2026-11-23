-- CreateEnum
CREATE TYPE "MembershipInvitationScope" AS ENUM ('ORGANIZATION', 'BRANCH');

-- CreateEnum
CREATE TYPE "MembershipInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "MembershipInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "email" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "MembershipInvitationScope" NOT NULL,
    "status" "MembershipInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipInvitation_tokenHash_key" ON "MembershipInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "MembershipInvitation_organizationId_email_scope_status_idx" ON "MembershipInvitation"("organizationId", "email", "scope", "status");

-- CreateIndex
CREATE INDEX "MembershipInvitation_branchId_email_status_idx" ON "MembershipInvitation"("branchId", "email", "status");

-- CreateIndex
CREATE INDEX "MembershipInvitation_status_expiresAt_idx" ON "MembershipInvitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MembershipInvitation_inviterUserId_createdAt_idx" ON "MembershipInvitation"("inviterUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_branchId_organizationId_fkey" FOREIGN KEY ("branchId", "organizationId") REFERENCES "Branch"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipInvitation" ADD CONSTRAINT "MembershipInvitation_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

--AddCheckConstraint
ALTER TABLE "MembershipInvitation"
ADD CONSTRAINT "MembershipInvitation_scope_branch_check"
CHECK (
    ("scope" = 'ORGANIZATION' AND "branchId" IS NULL)
    OR
    ("scope" = 'BRANCH' AND "branchId" IS NOT NULL)
);

-- AddCheckConstraint
ALTER TABLE "MembershipInvitation"
ADD CONSTRAINT "MembershipInvitation_status_acceptedAt_check"
CHECK (
    ("status" = 'ACCEPTED' AND "acceptedAt" IS NOT NULL)
    OR
    ("status" <> 'ACCEPTED' AND "acceptedAt" IS NULL)
);

-- AddCheckConstraint
ALTER TABLE "MembershipInvitation"
ADD CONSTRAINT "MembershipInvitation_timestamps_check"
CHECK (
    "expiresAt" > "createdAt"
    AND "updatedAt" >= "createdAt"
    AND (
        "acceptedAt" IS NULL
        OR (
            "acceptedAt" >= "createdAt"
            AND "acceptedAt" < "expiresAt"
            AND "acceptedAt" <= "updatedAt"
        )
    )
);

-- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "MembershipInvitation_pending_organization_email_key"
ON "MembershipInvitation" ("organizationId", LOWER("email"))
WHERE
    "scope" = 'ORGANIZATION'
    AND "status" = 'PENDING';
    
 -- CreatePartialUniqueIndex
CREATE UNIQUE INDEX "MembershipInvitation_pending_branch_email_key"
ON "MembershipInvitation" ("branchId", LOWER("email"))
WHERE
    "scope" = 'BRANCH'
    AND "status" = 'PENDING'
    AND "branchId" IS NOT NULL;