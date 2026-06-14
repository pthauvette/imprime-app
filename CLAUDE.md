# CLAUDE.md — Plio (imprime-app)

Boutique e-commerce d'impression (Québec). Next.js 15 App Router + TypeScript strict, Prisma/Postgres (Neon), Stripe, Sinalite (API impression), AWS S3/SES, NextAuth magic-link. Hébergé sur **AWS Amplify (Lambda)**. Expose un serveur **MCP** premium (« commander Plio par IA »).

## Langue & ton
- **Réponds en français canadien.** Code, identifiants et commentaires de code suivent le style existant du fichier.

## Commits & PRs (conventions strictes)
- **Aucun trailer `Co-Authored-By` (ni Claude, ni autre).** L'auteur git est déjà l'humain ; le message EST le message.
- Titres conventionnels en fr-CA : `type(scope): résumé (#NNN)` — ex. `fix(mobile): …`, `feat(mcp): …`. Corps en sections (cause / fix / vérif), terminé par une ligne récap du gate (« typecheck + build + N vitest »).
- Bodies de PR terminés par `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **`main` est protégée** : tout passe par une PR qui doit passer le check requis **« Typecheck + Vitest »**. Branche d'abord (`type/slug`), jamais de commit direct sur `main`. Jamais de force-push sur `main`.
- Ne **jamais** `gh pr merge` dans le même message que la vérif du gate.

## Le gate (à rejouer AVANT de pousser)
Séquence exacte de `.github/workflows/ci.yml`, dans l'ordre, stop au premier échec :
```
pnpm exec prisma generate   # sinon les imports @prisma/client cassent
pnpm typecheck              # tsc --noEmit
pnpm vitest run
NODE_OPTIONS='--max-old-space-size=4096' pnpm build   # cf. amplify.yml — build OOM sinon
```
Le skill `/gate` automatise ça. **CI verte ≠ prod OK** : après un merge, vérifier le déploiement avec `node scripts/check-deploy.mjs` (passer la `DATABASE_URL` PROD explicitement — le `.env` local pointe sur une branche Neon dev **périmée**).

## Invariants money-critical (revue adversariale obligatoire)
Fichiers : `src/lib/webhooks/stripe-process.ts`, `src/lib/mcp/place-order.ts`, `src/lib/mcp/checkout-session.ts`, `src/lib/db/orders.ts`. Lancer le subagent **`money-path-reviewer`** après toute modif.
- **Garde montant** : `intent.amount_received` doit `===` `order.amountCents` avant finalisation — ne jamais relâcher (régression #357/C1).
- **Transitioned-guard** : ne soumettre à Sinalite que si la transition PENDING→PAID a réellement eu lieu (`transitioned === true`) — anti double-production sur webhooks concurrents.
- **Mode B headless** reste **inerte** si `MCP_CREATE_ORDER_PAY ≠ ON` ET scope `orders:write:headless` absent ; plafond montant conservé.
- Restore wallet/referral **idempotent** (double-dip concurrent M2/M3 = **encore ouvert**).

## Pièges runtime Amplify / Lambda
- **JAMAIS `void asyncFn()` (ni IIFE async fire-and-forget, ni `.then` non-awaité) dans le code SERVEUR** (`src/app/api/**`, `src/lib/**`, crons) : le conteneur Lambda gèle après la réponse → la promesse est perdue (faux « slow query 138 s »). **TOUJOURS `await`** (ou `after()` de `next/server`). Sweep #322-324. **Exception : garder `void fetch(...)` CÔTÉ CLIENT** (`'use client'`, onClick/useEffect — le navigateur ne gèle pas). Le hook PostToolUse et le subagent `lambda-floating-promise` ne ciblent que le serveur.
- **PII / Loi 25** : redaction des logs ; **ne jamais rendre session/email en SSR header** (le runtime Amplify fuite des rendus entre requêtes) — résolu côté client via `ClientHeaderUserSlot`.

## CSS / overflow mobile
- **L'overflow ne se LIT pas, il se MESURE** : `document.documentElement.scrollWidth` vs `clientWidth` à 375px. Le skill `/overflow-scan` (→ `scripts/measure-overflow.mjs`) le fait. Audit statique = faux négatifs (#375).
- **Cause racine ouverte** : `src/styles/globals.css` (~16k l.) contient des pages HTML legacy collées → doublons de classes (`.auth-shell`, `.two-col`, `.adm-shell`) qui redéfinissent `grid-template-columns` **sans `@media`** après le collapse → grille jamais effondrée. Fix = override **EOF** (gagne par ordre source) ou **spécificité doublée `.X.X`** pour battre `migrated-pages.css`.
- **NE JAMAIS hand-éditer `src/styles/migrated-pages.css`** : généré (dédup auto, `scripts/css-dedup-analysis.mjs`). Une édition manuelle est écrasée et re-bloate. Un hook PreToolUse le bloque.

## Avant d'éditer
- **Lire le fichier (outil Read) avant de l'éditer.** Préférer les outils dédiés (Read/Grep/Glob) à `cat/sed/grep` en Bash.
