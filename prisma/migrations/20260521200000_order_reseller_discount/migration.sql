-- Round 22 #2 — Reseller checkout perks snapshot
ALTER TABLE "Order" ADD COLUMN "resellerDiscountCents" INTEGER NOT NULL DEFAULT 0;
