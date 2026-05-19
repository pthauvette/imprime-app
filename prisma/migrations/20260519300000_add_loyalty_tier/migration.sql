-- Loyalty tier based on net revenue 365 derniers jours. Recomputé
-- mensuellement via /api/cron/loyalty-tiers. BRONZE default pour
-- tout le monde — un trigger app-side fait le reste.
ALTER TABLE "User" ADD COLUMN "loyaltyTier" TEXT NOT NULL DEFAULT 'BRONZE';
ALTER TABLE "User" ADD COLUMN "loyaltyTierComputedAt" TIMESTAMP(3);
