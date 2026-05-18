-- Pixel tracking : openedAt = première ouverture, openCount = total hits.
-- NULL openedAt = pas encore ouvert (ou client mail bloque les images type
-- Outlook desktop sans preview).
ALTER TABLE "EmailDelivery" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "EmailDelivery" ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;
