-- Round 28 #5 — pause sans cancel pour wallet auto-renew.
-- NULL = active, set = paused (correspond à Stripe pause_collection).
ALTER TABLE "User" ADD COLUMN "walletAutoRenewPausedAt" TIMESTAMP(3);
