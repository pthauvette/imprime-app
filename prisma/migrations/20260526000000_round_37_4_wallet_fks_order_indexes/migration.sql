-- Round 37 #4 — WalletTransaction FK constraints + missing Order indexes.
--
-- Avant : WalletTransaction.orderId et adminId étaient String? sans
-- FK declaration → orphans possibles (orderId pointait vers Order
-- supprimé sans contrainte), pas d'index pour lookups admin/orderId.
--
-- Maintenant :
--   - FK constraints SetNull (préserve ledger même si Order/Admin supprimé)
--   - Indexes sur orderId et adminId
--   - Composite Order(status, paidAt) pour weekly-digest queries
--   - Index Order(promoCodeId) pour /admin/promo-codes/[id]

-- 1. Cleanup pre-existing orphan rows (orderId/adminId pointant vers
--    quelque chose qui n'existe pas dans Order/User) — NULL-out avant
--    d'ajouter la contrainte FK.
UPDATE "WalletTransaction"
SET "orderId" = NULL
WHERE "orderId" IS NOT NULL
  AND "orderId" NOT IN (SELECT "id" FROM "Order");

UPDATE "WalletTransaction"
SET "adminId" = NULL
WHERE "adminId" IS NOT NULL
  AND "adminId" NOT IN (SELECT "id" FROM "User");

-- 2. Add FK constraints (SetNull on delete preserves ledger)
ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Indexes pour les query patterns existants + futurs
CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");
CREATE INDEX "WalletTransaction_adminId_idx" ON "WalletTransaction"("adminId");

-- 4. Composite Order(status, paidAt) — cron admin-weekly-digest fait
--    WHERE status IN (...) AND paidAt >= cutoff. Single-index status seul
--    inutile pour range scan paidAt → switch to composite.
CREATE INDEX "Order_status_paidAt_idx" ON "Order"("status", "paidAt");

-- 5. Order(promoCodeId) — /admin/promo-codes/[id] loop findMany WHERE
--    promoCodeId → scan séquentiel à scale sans cet index.
CREATE INDEX "Order_promoCodeId_idx" ON "Order"("promoCodeId");
