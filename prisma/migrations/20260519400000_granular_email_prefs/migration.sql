-- Granular email preferences (Round 13 #1). Split l'ancien
-- emailDeliveryNotifications en 3 préférences indépendantes :
--   - emailDeliveryNotifications (kept) : ship/delivered live updates
--   - emailMarketing (new) : broadcasts admin + newsletter
--   - emailReengagement (new) : winback + post-delivery follow-up
-- Tous default TRUE → opt-in implicite à l'inscription, cohérent avec
-- le statut "existing business relationship" CASL.

ALTER TABLE "User" ADD COLUMN "emailMarketing" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "emailReengagement" BOOLEAN NOT NULL DEFAULT true;
