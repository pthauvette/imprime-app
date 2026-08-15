-- « /order/new émis, issue inconnue ».
--
-- Quand la réponse de la soumission ne revient jamais (délai d'attente,
-- conteneur Lambda tué), la commande peut exister chez le fournisseur sans que
-- rien ne l'indique chez nous : `sinaliteOrderId` reste null, et si le
-- conteneur a été tué le bloc `catch` n'a même pas tourné.
--
-- Le verrou `replayClaimedAt` expire au bout de quelques minutes et rend alors
-- le droit de recliquer — donc de produire une seconde fois. Cette colonne-ci
-- ne s'efface QUE sur preuve : succès confirmé, échec prouvablement pré-envoi,
-- ou geste humain explicite journalisé.
SET lock_timeout = '3s';

ALTER TABLE "Order" ADD COLUMN "sinaliteSubmitUncertainAt" TIMESTAMP(3);
