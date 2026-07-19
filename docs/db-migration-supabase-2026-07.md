# Migration DB Neon → Supabase (2026-07)

## Contexte
Neon PROD (`ep-small-mountain-aq8t6ehl.c-8.us-east-1.aws.neon.tech`, base `neondb`)
est devenue **injoignable** (P1001) — compute qui ne démarre plus, cause probable
= limite de plan / facturation. Symptômes : `/api/health` `db:postgres: fail`, et
le build Amplify échoue au preBuild `prisma migrate deploy` (P1001).

Décision (Patrick) : **migrer sur Supabase, en repartant à neuf** — l'app n'est
PAS encore en production (aucune commande / compte / wallet). **Exception : la
table `ProductOverride`** (markups/marges, noms custom, featured, produits
masqués) **doit être récupérée** de Neon. Le catalogue lui-même vient de Sinalite
(externe) → rien à migrer pour qu'il s'affiche.

⚠️ La récupération de `ProductOverride` EXIGE que Neon soit **réveillée**
(facturation débloquée) — sinon `pg_dump` échoue (P1001). C'est le seul
préalable côté Patrick pour cette partie.

## Ce qui est PROUVÉ (avant cutover)
- Schéma 100 % Postgres standard (aucune extension, IDs `cuid()` app-level).
- Les **61 migrations s'appliquent proprement sur un Postgres vierge** (testé en
  local via Docker `postgres:16` → 40 tables, `migrate status` = up to date).
- `prisma generate` ne requiert PAS `DIRECT_URL` → la CI reste verte sans
  changement (elle ne pose qu'un `DATABASE_URL` stub).

## Changement de code (ce PR)
- `prisma/schema.prisma` : ajout de `directUrl = env("DIRECT_URL")` au datasource
  (split pooler/direct requis par Supabase ; Neon poolait tout seul).
- Aucun changement à `amplify.yml` ni à la CI nécessaire : les env vars de la
  console Amplify sont injectées au shell de build → `migrate deploy` voit
  `DIRECT_URL` ; le runtime n'utilise que `DATABASE_URL`.

## Étapes de cutover (dans l'ordre)
1. **Créer le projet Supabase** (supabase.com). ✅ FAIT : projet « Plio »,
   ref `unabhnrynnnpllzhswek`, région **ca-central-1** (Montréal) — même région
   qu'Amplify (latence minimale) ET données au Canada (Loi 25). Postgres 17.6.
2. **Récupérer les 2 URLs** : projet → **Connect** → preset **Prisma** :
   - `DATABASE_URL` = **Transaction pooler** (port **6543**), avec
     `?pgbouncer=true` (Supabase l'inclut). Ajouter `&connection_limit=1`
     recommandé pour Lambda.
   - `DIRECT_URL` = **connexion directe / Session pooler** (port **5432**).
3. **Poser les env vars** :
   - Amplify → App settings → Environment variables : `DATABASE_URL` +
     `DIRECT_URL` (Patrick seul manipule le mot de passe).
   - (Optionnel) `.env` local pour vérifs.
4. **Merger ce PR** → le build Amplify lance `prisma migrate deploy` contre le
   Supabase vierge → crée le schéma complet (61 migrations) → puis `next build`.
5. **Vérifier** :
   - `node scripts/check-deploy.mjs` → SHA à jour + app live.
   - `curl https://www.plio.ca/api/health` → `db:postgres: pass`.
   - Smoke prod : connexion (crée le User admin via `ADMIN_EMAILS`), catalogue
     (Sinalite), passage d'une commande test.
6. **Repeupler** ce qui vient d'ailleurs :
   - Prix « à partir de » : le cron `refresh-product-prices` réamorce la table
     `ProductStartingPrice` (vide au départ → « Voir prix » en attendant).
   - Promo codes / réglages admin : à recréer via l'admin si besoin.

## Récupérer ProductOverride (Neon → Supabase)
La SEULE data à migrer. Prérequis : Neon réveillée + schéma Supabase créé
(étape 4 ci-dessus) + `pg_dump`/`psql` v16 (`brew install libpq && brew link
--force libpq`).

```bash
export NEON_URL='postgresql://…@ep-small-mountain-…neon.tech/neondb?sslmode=require'
export SUPABASE_URL='postgresql://…@…pooler.supabase.com:5432/postgres'   # DIRECT (5432)
./scripts/migrate-product-overrides.sh
```
Le script (idempotent : TRUNCATE + copie) dumpe UNIQUEMENT `ProductOverride`,
l'importe dans Supabase, et vérifie l'égalité des comptages. Les URLs sont lues
depuis l'env (jamais loggées). ⚠️ À lancer AVANT de reconfigurer des overrides
dans l'admin Supabase (sinon écrasés).

## Après cutover (à faire)
- Mettre à jour la mémoire projet : `neon-db-local-stale` devient obsolète ;
  noter Supabase comme DB prod.
- Si l'OOM du build revient (SIGKILL à `next build`, une fois Neon débloqué au
  preBuild) : c'est l'autre problème — palliatif `webpackMemoryOptimizations`
  (#454) en place, sinon passer le build compute Amplify en « Large ».
- Décider du sort des données Neon (récupérer via pg_dump, ou abandonner).
