-- Net Promoter Score feedback — interne admin-only (vs Review qui est
-- 5★ public modéré). 1 NPS max par order via @unique.
CREATE TABLE "NpsResponse" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NpsResponse_orderId_key" ON "NpsResponse"("orderId");
CREATE INDEX "NpsResponse_score_createdAt_idx" ON "NpsResponse"("score", "createdAt");
CREATE INDEX "NpsResponse_createdAt_idx" ON "NpsResponse"("createdAt");
