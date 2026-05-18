-- Write-through cache pour les endpoints catalog Sinalite. Si Sinalite
-- API est down, on sert depuis cette table (stale) plutôt qu'un 500 —
-- le wizard reste utilisable.
CREATE TABLE "SinaliteCacheEntry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SinaliteCacheEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SinaliteCacheEntry_key_key" ON "SinaliteCacheEntry"("key");
