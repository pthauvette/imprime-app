#!/usr/bin/env bash
# PreToolUse(Bash) — bloque un force-push DESTRUCTIF vers main.
# Autorise --force-with-lease (force sûr). main est protégée (cf. CLAUDE.md).
set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty')

# Pas un git push → on laisse passer.
echo "$cmd" | grep -qE 'git[[:space:]].*push' || exit 0
# --force-with-lease = force sûr → autorisé.
echo "$cmd" | grep -q -- '--force-with-lease' && exit 0
# Pas de --force / -f → rien à bloquer.
echo "$cmd" | grep -qE -- '(--force([^-]|$)|(^|[[:space:]])-f([[:space:]]|$))' || exit 0

# main ciblée EXPLICITEMENT (origin main, HEAD:main, :main, … main) ?
explicit_main=no
echo "$cmd" | grep -qE -- '(origin[[:space:]]+main|HEAD:main|:main|[[:space:]]main([[:space:]]|$))' && explicit_main=yes

# Push BARE (aucun refspec/remote après `push` et ses flags) ?
rest=$(echo "$cmd" | sed -E 's/.*push//')                       # tout après le dernier `push`
rest_no_flags=$(echo "$rest" | sed -E 's/-{1,2}[A-Za-z][A-Za-z-]*(=[^[:space:]]*)?//g')
rest_trim=$(echo "$rest_no_flags" | tr -d '[:space:];&|')
bare=no
[ -z "$rest_trim" ] && bare=yes

cur=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

# Bloque si : main explicite, OU push bare alors qu'on est sur main.
if [ "$explicit_main" = "yes" ] || { [ "$bare" = "yes" ] && [ "$cur" = "main" ]; }; then
  echo "BLOQUÉ : force-push destructif vers main interdit (main est protégée, no force-push). Utilise --force-with-lease sur une branche, jamais --force sur main." >&2
  exit 2
fi

exit 0
