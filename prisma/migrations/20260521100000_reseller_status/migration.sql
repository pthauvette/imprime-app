-- Round 21 #4 — Reseller status auto-detection
ALTER TABLE "User" ADD COLUMN "resellerStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN "resellerDetectedAt" TIMESTAMP(3);
