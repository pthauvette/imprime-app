-- Round 14 #3 — ajoute les FK manquantes pour les 4 colonnes orphan
-- (même pattern que NpsResponse fixé Round 13 #2).
-- Choix ON DELETE SetNull (vs Cascade) pour ces 4 cas : la row child
-- garde sa valeur historique pour audit/replay même si l'Order disparait.
--
-- Edge case : si une row existante référence un orderId qui n'existe pas
-- dans Order (orphan accumulé avant la FK), le ADD CONSTRAINT va fail.
-- Pour s'assurer que la migration apply clean, on NULL-out d'abord les
-- références cassées.

-- WebhookEvent.orderId
UPDATE "WebhookEvent"
  SET "orderId" = NULL
  WHERE "orderId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Order" WHERE "Order"."id" = "WebhookEvent"."orderId");

ALTER TABLE "WebhookEvent"
  ADD CONSTRAINT "WebhookEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- EmailDelivery.attachOrderId
UPDATE "EmailDelivery"
  SET "attachOrderId" = NULL
  WHERE "attachOrderId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Order" WHERE "Order"."id" = "EmailDelivery"."attachOrderId");

ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_attachOrderId_fkey"
  FOREIGN KEY ("attachOrderId") REFERENCES "Order"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- ReferralReward.refereeOrderId (+ UNIQUE pour aligner avec schema)
UPDATE "ReferralReward"
  SET "refereeOrderId" = NULL
  WHERE "refereeOrderId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Order" WHERE "Order"."id" = "ReferralReward"."refereeOrderId");

-- Si la colonne n'a pas déjà l'index UNIQUE (legacy schema), on l'ajoute.
-- IF NOT EXISTS est PostgreSQL-only — Prisma cible Postgres, c'est OK.
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralReward_refereeOrderId_key"
  ON "ReferralReward"("refereeOrderId");

ALTER TABLE "ReferralReward"
  ADD CONSTRAINT "ReferralReward_refereeOrderId_fkey"
  FOREIGN KEY ("refereeOrderId") REFERENCES "Order"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- ContactMessage.orderId
UPDATE "ContactMessage"
  SET "orderId" = NULL
  WHERE "orderId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "Order" WHERE "Order"."id" = "ContactMessage"."orderId");

ALTER TABLE "ContactMessage"
  ADD CONSTRAINT "ContactMessage_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
