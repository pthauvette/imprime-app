-- finding [127] — companyName saisi au sign-up (cookie plio_pending_profile,
-- src/lib/auth/pending-profile.ts) mais jamais persisté nulle part (le
-- commentaire prétendait "stocké dans Address" — faux : Address n'a même
-- pas de champ companyName). La donnée était simplement capturée puis
-- perdue au 1er sign-in.
--
-- NULL pour tous les comptes existants (aucun n'avait cette donnée avant
-- ce fix) — aucune régression.
ALTER TABLE "User" ADD COLUMN "companyName" TEXT;
