#!/usr/bin/env bash
# PostToolUse(Write|Edit) — avertit (NON bloquant) si un `void <async>()` (floating
# promise) est introduit dans du code SERVEUR : gèle sur Amplify/Lambda après la
# réponse (leçon #322-324, cf. CLAUDE.md § Pièges runtime). Épargne le code client.
set -euo pipefail

f=$(jq -r '.tool_input.file_path // empty')

# Seulement le code serveur (routes API + lib). Hors de ça → on ignore.
echo "$f" | grep -qE 'src/(app/api|lib)/.*\.(ts|tsx)$' || exit 0
# Le navigateur ne gèle pas : épargne tout fichier client.
grep -q "use client" "$f" 2>/dev/null && exit 0

# Lignes AJOUTÉES par cette modif, hors commentaires, hors `await`,
# qui contiennent `void <ident>(` ou `void (` (IIFE async).
hits=$(git --no-pager diff --unified=0 -- "$f" 2>/dev/null \
  | grep -E '^\+' \
  | grep -vE '^\+[[:space:]]*(//|\*|/\*)' \
  | grep -vE '\bawait\b' \
  | grep -E 'void[[:space:]]+([A-Za-z_$][A-Za-z0-9_$.]*[[:space:]]*\(|\()' || true)

if [ -n "$hits" ]; then
  echo "ATTENTION : un \`void <async>()\` semble ajouté dans un fichier SERVEUR → risque de promesse flottante GELÉE sur Lambda (le conteneur gèle après la réponse, leçon #322-324). AWAIT-le, ou utilise after() de next/server. Si c'est un void fetch CLIENT volontaire, ce fichier ne devrait pas être sous src/app/api ou src/lib." >&2
fi

exit 0
