#!/usr/bin/env bash
#
# Recopie CIBLÉE de la table ProductOverride : Neon (source) → Supabase (cible).
#
# Contexte : migration DB 2026-07 (repart à neuf sur Supabase). Le catalogue
# vient de Sinalite (rien à migrer) ; la SEULE config produit en base =
# ProductOverride (markup/marges, noms custom, featured, produits masqués).
# Ce script copie UNIQUEMENT cette table.
#
# ── Sécurité ────────────────────────────────────────────────────────────────
# Les 2 URLs (avec mot de passe) sont lues depuis l'ENVIRONNEMENT — jamais en
# argument, jamais loggées. Tu les poses toi-même dans ton terminal :
#
#   export NEON_URL='postgresql://…@ep-small-mountain-…neon.tech/neondb?sslmode=require'
#   export SUPABASE_URL='postgresql://…@…pooler.supabase.com:5432/postgres'   # DIRECT (5432)
#   ./scripts/migrate-product-overrides.sh
#
# ⚠️ Prérequis :
#   1. Neon RÉVEILLÉE (facturation débloquée) — sinon pg_dump échoue (P1001).
#   2. Le schéma Supabase DÉJÀ créé (le build Amplify de la PR #455 a tourné →
#      la table ProductOverride existe, vide).
#   3. `pg_dump` + `psql` v16 installés (brew install libpq, ou postgresql@16).
#
# Idempotent : on TRUNCATE la table cible avant l'import (elle est censée être
# vide de toute façon) → relançable sans doublon. NE PAS lancer après avoir
# reconfiguré des overrides dans l'admin Supabase (ça les écraserait).

set -euo pipefail

: "${NEON_URL:?Pose NEON_URL (source Neon) dans l'environnement}"
: "${SUPABASE_URL:?Pose SUPABASE_URL (cible Supabase, connexion DIRECTE port 5432) dans l'environnement}"

TABLE='"public"."ProductOverride"'

echo "→ Test de connexion Neon (source)…"
psql "$NEON_URL" -tAc "SELECT count(*) FROM $TABLE" | { read -r n; echo "  Neon : $n ligne(s) dans ProductOverride"; }

echo "→ Test de connexion Supabase (cible)…"
psql "$SUPABASE_URL" -tAc "SELECT 1 FROM $TABLE LIMIT 1" >/dev/null \
  && echo "  Supabase : table ProductOverride présente." \
  || { echo "  ✗ Table ProductOverride absente côté Supabase — le build #455 a-t-il tourné (migrate deploy) ?"; exit 1; }

echo "→ Purge de la cible (idempotence) + copie des données…"
# --data-only : pas de DDL (la table existe déjà via migrate deploy).
# --column-inserts : INSERT explicites (robuste aux petites divergences d'ordre de colonnes).
# On enchaîne TRUNCATE + INSERTs dans UNE transaction psql côté cible.
{
  echo "BEGIN;";
  echo "TRUNCATE TABLE $TABLE;";
  pg_dump "$NEON_URL" --data-only --column-inserts --table="$TABLE";
  echo "COMMIT;";
} | psql "$SUPABASE_URL" -v ON_ERROR_STOP=1 >/dev/null

echo "→ Vérification post-copie…"
src=$(psql "$NEON_URL"     -tAc "SELECT count(*) FROM $TABLE")
dst=$(psql "$SUPABASE_URL" -tAc "SELECT count(*) FROM $TABLE")
echo "  Neon=$src  →  Supabase=$dst"
[ "$src" = "$dst" ] && echo "✅ ProductOverride migré ($dst ligne(s))." \
  || { echo "✗ Écart de comptage — à investiguer."; exit 1; }
