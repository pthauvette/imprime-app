-- CreateTable
CREATE TABLE "ProductStartingPrice" (
    "sinaliteProductId" INTEGER NOT NULL,
    "minTotalCents" INTEGER,
    "variantCount" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStartingPrice_pkey" PRIMARY KEY ("sinaliteProductId")
);

-- CreateIndex
CREATE INDEX "ProductStartingPrice_computedAt_idx" ON "ProductStartingPrice"("computedAt");
