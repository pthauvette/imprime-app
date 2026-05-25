-- Round 39 #5 — Order.slaAlertedAt pour dedup les emails order-sla-alerts.
--
-- Avant : le cron quotidien emailait l'admin avec la liste des stuck
-- orders SANS dedup. Un order PAID depuis 5 jours sans webhook Sinalite
-- = 5 emails identiques admin. Spam → admin marque comme lu sans regarder
-- → vraie urgence (96h+) noyée dans le bruit.
--
-- Maintenant : un order N'EST INCLUS dans l'email SLA QUE si :
--   slaAlertedAt IS NULL (jamais alerté) OU slaAlertedAt < now - 7d
--   (re-alerté après 1 semaine — escalation pour les chroniques).
--
-- Après send réussi, on updateMany les IDs inclus pour set slaAlertedAt.

ALTER TABLE "Order" ADD COLUMN "slaAlertedAt" TIMESTAMP(3);

-- Index pour le WHERE du cron (filtré + ordered par paidAt déjà indexé).
CREATE INDEX "Order_slaAlertedAt_idx" ON "Order"("slaAlertedAt");
