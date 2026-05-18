-- Capture des carts abandonnés à partir du step shipping (= email saisi).
-- Cron 1h envoie un recovery email 24h+ après, 1x par cart via emailSentAt.

CREATE TABLE "AbandonedCart" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "resumeQuery" TEXT NOT NULL,
    "lastStep" TEXT NOT NULL,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbandonedCart_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AbandonedCart_emailSentAt_updatedAt_idx" ON "AbandonedCart"("emailSentAt", "updatedAt");
CREATE INDEX "AbandonedCart_email_updatedAt_idx" ON "AbandonedCart"("email", "updatedAt");
