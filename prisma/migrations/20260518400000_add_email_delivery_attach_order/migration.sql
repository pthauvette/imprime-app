-- Permet d'attacher la facture PDF générée à la volée à un envoi d'email
-- (ex: order-confirmation). Le retry cron régénère le PDF de la même order
-- — pas besoin de persister les bytes en DB.
ALTER TABLE "EmailDelivery" ADD COLUMN "attachOrderId" TEXT;
