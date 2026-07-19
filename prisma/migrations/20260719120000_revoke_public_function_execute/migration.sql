-- Ferme 2 avertissements du linter sécurité Supabase (get_advisors, niveau WARN,
-- EXTERNAL-facing) relevés après la migration Supabase :
--
--   anon_security_definer_function_executable
--   authenticated_security_definer_function_executable
--   → « Function public.rls_auto_enable() can be executed by the anon /
--      authenticated role as a SECURITY DEFINER function via
--      /rest/v1/rpc/rls_auto_enable »
--
-- `rls_auto_enable()` est créée par SUPABASE lui-même (event trigger qui active
-- RLS sur toute nouvelle table). Elle est SECURITY DEFINER (privilèges élevés)
-- ET exposée via PostgREST → appelable anonymement. Exploitabilité réelle
-- faible (hors contexte d'event trigger, pg_event_trigger_ddl_commands() échoue),
-- mais c'est du privilège élevé joignable publiquement : on révoque.
--
-- La migration RLS précédente (20260719000000) révoquait les droits sur les
-- TABLES et SEQUENCES, mais pas sur les FUNCTIONS — d'où ce complément. On
-- révoque en masse (toutes les fonctions du schéma public) + les privilèges par
-- défaut, pour couvrir aussi toute fonction FUTURE.
--
-- Sans impact sur l'app : elle n'utilise PAS PostgREST/RPC (uniquement Prisma
-- avec le rôle propriétaire). L'event trigger continue de fonctionner : il est
-- déclenché par le moteur sur DDL, pas via une exécution par le rôle anon.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;
