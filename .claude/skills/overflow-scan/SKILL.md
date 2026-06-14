---
name: overflow-scan
description: Mesure l'overflow horizontal mobile (scrollWidth vs clientWidth à 375px) sur les pages publiques via Playwright. À utiliser quand l'utilisateur parle d'overflow / de débordement mobile, ou après un changement dans src/styles/globals.css.
---

# Overflow scan — mobile 375px

Principe de Plio : **l'overflow ne se LIT pas, il se MESURE.** L'audit statique du CSS produit des faux négatifs (#375). Ce skill mesure objectivement.

## Lancer

1. Démarrer le serveur dev s'il ne tourne pas : `pnpm dev` (port 3000).
2. Lancer la mesure :
   ```bash
   node scripts/measure-overflow.mjs
   ```
   Optionnel : `BASE_URL=http://localhost:3100 node scripts/measure-overflow.mjs` pour viser le build prod local.

Le script charge chaque route publique à un viewport de **375 px**, compare `document.documentElement.scrollWidth` à `clientWidth`, et **échoue (exit 1)** si une page déborde — utilisable comme garde de non-régression.

## Interpréter

- `OK` = `scrollWidth ≤ clientWidth`. `OVERFLOW +Npx` = déborde de N px → à corriger.
- Diagnostic de cause : grep la classe de layout dans `src/styles/globals.css`, repérer la **2e définition `grid-template-columns` multi-colonnes POSTÉRIEURE** au `@media` de collapse (ordre source) — c'est elle qui écrase l'effondrement. Fix = override **EOF** dans globals (gagne par ordre source) ou **spécificité doublée `.X.X`** si `migrated-pages.css` gagne.
- **NE JAMAIS** hand-éditer `src/styles/migrated-pages.css` (généré ; un hook le bloque).

## Limites (importantes)

- Couvre **les pages publiques** rendables en dev. Les pages **auth-gated** (`/account`, `/admin`, le wizard `/order/*`, `/settings`…) — précisément là où vivent `.auth-shell` / `.adm-shell` / `.two-col` — **ne sont pas rendables sans session** : pour celles-là, audit d'**ordre source** dans globals.css, pas runtime.
- Le **preview tool** est peu fiable pour la LARGEUR (innerWidth bloqué ~688, iframe `X-Frame-Options: DENY`) → trancher par ce script, pas par le preview.
