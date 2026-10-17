-- CreateTable
CREATE TABLE "EmailVerificationChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationChallenge_tokenHash_key" ON "EmailVerificationChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationChallenge_userId_expiresAt_idx" ON "EmailVerificationChallenge"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerificationChallenge_email_expiresAt_idx" ON "EmailVerificationChallenge"("email", "expiresAt");

-- AddForeignKey
ALTER TABLE "EmailVerificationChallenge" ADD CONSTRAINT "EmailVerificationChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
