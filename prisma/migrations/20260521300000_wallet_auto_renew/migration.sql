-- Round 22 #3 — Wallet auto-renew subscription tracking
ALTER TABLE "User" ADD COLUMN "walletAutoRenewStripeSubId" TEXT;
ALTER TABLE "User" ADD COLUMN "walletAutoRenewAmountCents" INTEGER;
