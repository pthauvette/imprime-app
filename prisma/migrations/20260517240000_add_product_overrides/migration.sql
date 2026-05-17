-- CreateTable
CREATE TABLE "ProductOverride" (
    "id" TEXT NOT NULL,
    "sinaliteProductId" INTEGER NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "displayDescription" TEXT,
    "marginPct" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductOverride_sinaliteProductId_key" ON "ProductOverride"("sinaliteProductId");

-- CreateIndex
CREATE INDEX "ProductOverride_disabled_idx" ON "ProductOverride"("disabled");

-- CreateIndex
CREATE INDEX "ProductOverride_featured_idx" ON "ProductOverride"("featured");
