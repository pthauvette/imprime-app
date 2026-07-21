-- Cloisonnement des brouillons d'INVITÉS (audit pré-lancement 2026-07, P1-5).
--
-- Tous les visiteurs non connectés partagent UNE seule row User
-- (`guest@plio.local`, créée par upsert dans /api/designs/finalize). Filtrer
-- par `userId` ne les sépare donc PAS entre eux : le commentaire du code
-- affirmait qu'« un draftId d'un autre user ne matche rien » — vrai entre
-- comptes réels, FAUX entre invités. Un invité qui obtenait le draftId d'un
-- autre (via un Referer, une URL partagée) pouvait ÉCRASER son design.
--
-- `guestToken` = valeur aléatoire 256 bits gardée dans un cookie httpOnly.
-- C'est un jeton porteur : le posséder prouve qu'on est le navigateur d'origine.
-- NULL pour les drafts de comptes réels (userId suffit déjà à les cloisonner).
ALTER TABLE "DesignDraft" ADD COLUMN "guestToken" TEXT;

CREATE INDEX "DesignDraft_guestToken_idx" ON "DesignDraft"("guestToken");
