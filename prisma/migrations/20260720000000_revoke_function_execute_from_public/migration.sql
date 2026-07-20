-- Complète 20260719120000 : révoquer EXECUTE depuis PUBLIC (pas seulement
-- depuis anon/authenticated).
--
-- POURQUOI la 1re tentative n'a pas suffi : en Postgres, toute fonction
-- accorde EXECUTE à PUBLIC par défaut. Révoquer nommément `anon` et
-- `authenticated` les retire de l'ACL... mais ils gardent le droit HÉRITÉ de
-- PUBLIC. Constaté sur la base réelle :
--
--   proacl AVANT : {=X/postgres, postgres=X/postgres, service_role=X/postgres}
--                   ^^^ grantee vide = PUBLIC ⇒ anon/authenticated passent par là
--   proacl APRÈS : {postgres=X/postgres, service_role=X/postgres}   ✅
--
-- Ferme les 2 WARN du linter Supabase (get_advisors) :
--   anon_security_definer_function_executable
--   authenticated_security_definer_function_executable
-- sur `public.rls_auto_enable()` (fonction SECURITY DEFINER créée par Supabase,
-- exposée via /rest/v1/rpc/).
--
-- Périmètre vérifié : `public` ne contient QU'UNE fonction (rls_auto_enable).
-- Sans impact app : Prisma se connecte en `postgres` (propriétaire, conserve
-- EXECUTE) et n'utilise pas PostgREST/RPC. `service_role` conserve aussi son
-- droit. L'event trigger `ensure_rls` continue de fonctionner (déclenché par le
-- moteur sur DDL, exécuté avec les droits du propriétaire).
--
-- ALTER DEFAULT PRIVILEGES couvre les fonctions FUTURES.

REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
