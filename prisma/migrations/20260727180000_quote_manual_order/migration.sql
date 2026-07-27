-- finding [129] — boucle du devis sur mesure : le courriel de quote
-- renvoyait vers le formulaire vierge, aucun moyen de payer n'était généré
-- côté admin. Décision Patrick : commande manuelle admin, production gérée
-- HORS Sinalite (certains projets custom — ex. signage extérieur — n'ont pas
-- de SKU au catalogue).
--
-- Order.skipSinaliteSubmission : quand true, le webhook Stripe s'arrête à
-- PAID, ne soumet jamais à Sinalite (cf. stripe-process.ts). Défaut false —
-- NULL pour aucune commande existante, aucune régression.
ALTER TABLE "Order" ADD COLUMN "skipSinaliteSubmission" BOOLEAN NOT NULL DEFAULT false;

-- CustomQuoteRequest.quotedAmountCents : montant FINAL négocié par l'admin,
-- distinct de budgetCents (estimation du client à la demande initiale).
ALTER TABLE "CustomQuoteRequest" ADD COLUMN "quotedAmountCents" INTEGER;

-- CustomQuoteRequest.orderId : lien vers la commande créée depuis ce devis.
ALTER TABLE "CustomQuoteRequest" ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "CustomQuoteRequest_orderId_key" ON "CustomQuoteRequest"("orderId");
ALTER TABLE "CustomQuoteRequest" ADD CONSTRAINT "CustomQuoteRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
