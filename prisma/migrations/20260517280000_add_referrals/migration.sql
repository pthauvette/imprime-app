-- AlterTable User : champs parrainage (referralCode + referredByCode + creditCents)
ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByCode" TEXT;
ALTER TABLE "User" ADD COLUMN "referralCreditCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable Order : crédit parrainage utilisé à ce checkout
ALTER TABLE "Order" ADD COLUMN "referralCreditAppliedCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredByCode_idx" ON "User"("referredByCode");

-- CreateTable ReferralReward
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeUserId" TEXT NOT NULL,
    "refereeOrderId" TEXT,
    "creditCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralReward_refereeUserId_key" ON "ReferralReward"("refereeUserId");
CREATE INDEX "ReferralReward_referrerId_createdAt_idx" ON "ReferralReward"("referrerId", "createdAt");
CREATE INDEX "ReferralReward_status_idx" ON "ReferralReward"("status");

-- AddForeignKey
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ReferralReward" ADD CONSTRAINT "ReferralReward_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
