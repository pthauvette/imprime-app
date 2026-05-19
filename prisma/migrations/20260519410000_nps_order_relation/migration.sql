-- Round 13 #2 : ajoute la FK Order ← NpsResponse pour permettre
-- des where { npsResponse: { is: null } } sur Order (pour le NPS auto-prompt).
-- La colonne orderId existait déjà avec UNIQUE — on lui ajoute juste la
-- contrainte FK + ON DELETE CASCADE (cohérent avec Review).

ALTER TABLE "NpsResponse"
  ADD CONSTRAINT "NpsResponse_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
