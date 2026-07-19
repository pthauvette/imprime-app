-- Durcissement Supabase : RLS sur TOUTES les tables du schéma public.
--
-- POURQUOI (spécifique Supabase, inexistant sur Neon) : Supabase expose le
-- schéma `public` via son API REST (PostgREST) avec la clé `anon`, qui est
-- PUBLIQUE par design. Nos tables contiennent de la PII (User.email,
-- Order.shipLine1/shipPhone, Address…) → sans RLS, elles seraient lisibles par
-- quiconque possède la clé anon. Loi 25 : inacceptable.
--
-- COMMENT : on active RLS SANS créer de policy → tout accès est refusé par
-- défaut pour `anon` / `authenticated`. L'app n'est PAS affectée : Prisma se
-- connecte avec le rôle PROPRIÉTAIRE des tables (`postgres`), et un
-- propriétaire CONTOURNE RLS tant qu'on ne met pas FORCE ROW LEVEL SECURITY
-- (ce qu'on ne fait volontairement pas).
--
-- ⚠️ TABLES FUTURES : ce bloc couvre les tables existant AU MOMENT de cette
-- migration. Toute NOUVELLE table ajoutée plus tard devra elle aussi activer
-- RLS (sinon elle sera exposée). Le contrôle `get_advisors` de Supabase
-- (type: security) détecte les tables sans RLS — à lancer après tout ajout.

-- 1) RLS sur toutes les tables publiques (hors bookkeeping Prisma).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- 2) Défense en profondeur : retirer les privilèges des rôles publics Supabase.
--    Gardé par un test d'existence — ces rôles n'existent PAS sur un Postgres
--    nu (Docker local, CI), où un REVOKE brut ferait échouer la migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
  END IF;
END $$;
