-- Verrou atomique du rejeu Sinalite admin.
--
-- Le garde « cette commande est-elle déjà soumise ? » était un read-then-act :
-- deux requêtes concurrentes (deux onglets, deux administrateurs) lisaient
-- toutes deux `sinaliteOrderId IS NULL` et soumettaient DEUX FOIS — donc deux
-- productions réelles facturées. Le webhook Stripe est protégé par un
-- `updateMany` conditionnel ; cette colonne donne la même garantie ici.
--
-- Horodatage plutôt que booléen : sur une route dont l'objet même est de
-- réessayer, un verrou sans péremption transformerait une Lambda interrompue en
-- blocage permanent, à débloquer en base à la main.
--
-- Additive et nullable : aucune donnée à reprendre, aucune commande existante
-- affectée.
-- `ACCESS EXCLUSIVE` : si cet ALTER se met en file derrière une transaction
-- longue sur "Order", TOUT le trafic commandes se bloque derrière lui. Avec un
-- délai, la migration échoue proprement et se rejoue — sans geler la boutique.
SET lock_timeout = '3s';

ALTER TABLE "Order" ADD COLUMN "replayClaimedAt" TIMESTAMP(3);
