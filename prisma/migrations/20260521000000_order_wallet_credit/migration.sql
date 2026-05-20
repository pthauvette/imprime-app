-- Round 20 #3 — wallet credit applied snapshot sur Order
ALTER TABLE "Order" ADD COLUMN "walletCreditAppliedCents" INTEGER NOT NULL DEFAULT 0;
