#!/usr/bin/env bash
# PreToolUse(Write|Edit) — bloque l'édition du CSS GÉNÉRÉ, avertit sur globals.css.
# Reçoit le payload JSON de l'outil sur stdin (cf. CLAUDE.md § CSS / overflow).
set -euo pipefail

fp=$(jq -r '.tool_input.file_path // empty')

case "$fp" in
  */src/styles/migrated-pages.css|src/styles/migrated-pages.css)
    echo "BLOQUÉ : src/styles/migrated-pages.css est GÉNÉRÉ (dédup auto, scripts/css-dedup-analysis.mjs). Édite la source/le générateur — une édition à la main est écrasée à la régénération et re-bloate le CSS." >&2
    exit 2
    ;;
  */src/styles/globals.css|src/styles/globals.css)
    echo "Note : globals.css (~16k l.) est la cause racine documentée des overflows mobiles (doublons de classes legacy non gardés par @media). Préfère un override EOF gardé par @media, et MESURE l'overflow (scrollWidth vs clientWidth @375px) — ne le lis pas." >&2
    ;;
esac

exit 0
