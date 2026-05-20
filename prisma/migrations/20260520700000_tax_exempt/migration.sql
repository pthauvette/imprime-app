-- Round 18 #5 — Tax-exempt B2B flag + cert ID
ALTER TABLE "User" ADD COLUMN "taxExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "taxExemptCertId" TEXT;
