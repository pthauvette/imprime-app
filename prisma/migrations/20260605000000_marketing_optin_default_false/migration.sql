-- Loi 25 — le consentement marketing doit être affirmatif (opt-in explicite).
-- On bascule le défaut de User.emailMarketing de true → false : un compte créé
-- sans cocher la case (ou via connexion directe magic-link) reste opt-out.
-- Metadata-only (pas de réécriture de table). Les lignes EXISTANTES gardent
-- leur valeur (utilisateurs déjà opt-in grandfathés).
ALTER TABLE "User" ALTER COLUMN "emailMarketing" SET DEFAULT false;
