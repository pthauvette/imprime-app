-- Memo interne admin sur un User : free-text + métadonnées audit lite
-- (qui a modifié + quand). Jamais affiché au customer.
ALTER TABLE "User" ADD COLUMN "adminNotes" TEXT;
ALTER TABLE "User" ADD COLUMN "adminNotesUpdatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "adminNotesUpdatedBy" TEXT;
