-- Round 19 #3 — Wallet rolling expiration tracking
ALTER TABLE "User" ADD COLUMN "walletLastActivityAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "walletExpiryWarningAt" TIMESTAMP(3);
