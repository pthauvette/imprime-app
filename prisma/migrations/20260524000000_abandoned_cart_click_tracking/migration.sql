-- Round 27 #1 — Tracker le funnel abandoned-cart recovery.
--   sent       = WHERE emailSentAt IS NOT NULL
--   clicked    = WHERE recoveryClickedAt IS NOT NULL
--   recovered  = SELECT COUNT(DISTINCT id) FROM "Order" WHERE recoveredFromCartId IS NOT NULL

ALTER TABLE "AbandonedCart" ADD COLUMN "recoveryClickedAt" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN "recoveredFromCartId" TEXT;

CREATE INDEX "Order_recoveredFromCartId_idx" ON "Order"("recoveredFromCartId");

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_recoveredFromCartId_fkey"
  FOREIGN KEY ("recoveredFromCartId") REFERENCES "AbandonedCart"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
