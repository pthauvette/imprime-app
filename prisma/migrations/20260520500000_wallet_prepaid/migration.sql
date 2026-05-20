-- Round 18 #1 — Wallet prepaid credit
-- User.walletCents : balance courant cached (audit complet dans WalletTransaction)
-- WalletTransaction : append-only ledger

ALTER TABLE "User" ADD COLUMN "walletCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "WalletTransaction" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "kind"              TEXT NOT NULL,
  "amountCents"       INTEGER NOT NULL,
  "balanceAfterCents" INTEGER NOT NULL,
  "paymentIntentId"   TEXT,
  "orderId"           TEXT,
  "adminId"           TEXT,
  "description"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletTransaction_userId_createdAt_idx"
  ON "WalletTransaction"("userId", "createdAt");
CREATE INDEX "WalletTransaction_kind_createdAt_idx"
  ON "WalletTransaction"("kind", "createdAt");
CREATE INDEX "WalletTransaction_paymentIntentId_idx"
  ON "WalletTransaction"("paymentIntentId");

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
