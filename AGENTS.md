# Plio repo — agent navigation guide

> Document maintenu pour les coding agents (Claude Code, Cursor, etc.)
> qui n'ont pas l'historique d'évolution Round 12-38+ en mémoire.
> Lire ce fichier en premier pour comprendre les conventions.

## TL;DR

- **Stack** : Next.js 16 App Router + Prisma 6 + Postgres (Neon) + Stripe + Sinalite
- **Pattern de travail** : Rounds de 5 PRs autonomes, format `feat/fix(scope): summary (Round N #M)`
- **Test cadence** : `pnpm exec vitest run` (1100+ tests, ~3s, fully mocked DB)
- **Type cadence** : `pnpm exec tsc --noEmit` (toujours clean avant commit)
- **Money path** : tout en cents (`Int`), `formatCents()` pour display, `formatCurrency()` accepte dollars
- **Wallet** : ledger append-only via `recordWalletTx()` (Round 38 #3 atomic)
- **Stripe** : tous les mutating calls ont `idempotencyKey` (Round 38 #3)

## Where to find X

| Sujet | Path | Key file |
|-------|------|----------|
| Schema Prisma | `prisma/schema.prisma` | 1500+ lignes, Order/User/WalletTransaction au cœur |
| Migrations | `prisma/migrations/` | Linéaire, jamais reset historique |
| Sinalite client | `src/lib/sinalite/client.ts` | Wraps avec timeout + cache TTL 10min |
| Webhook Stripe | `src/lib/webhooks/stripe-process.ts` | + `markOrderPaidWithWalletDebit` |
| Order helpers | `src/lib/db/orders.ts` | `markOrder*` avec optimistic locking (Round 38 #4) |
| Email queue | `src/lib/emails/queue.ts` | Throttle 5/24h, atomic retry claim |
| Tax math | `src/lib/taxes/index.ts` | 13 provinces, source canonique |
| Reseller perks | `src/lib/reseller/perks.ts` | NONE/AUTO/VERIFIED/PLATINUM, 5%/10% |
| Loyalty tiers | `src/lib/customers/loyalty.ts` | BRONZE/SILVER/GOLD, free shipping GOLD |
| Status labels | `src/lib/orders/status-labels.ts` | Source canonique FR (Round 37 #5) |
| Format helpers | `src/lib/format.ts` | `formatCurrency`, `formatCents`, `formatDate` |
| Env validation | `src/lib/env.ts` | Zod schema, fail-fast en prod (Round 38 #5) |
| Confirm dialog | `src/hooks/useConfirmDialog.tsx` | Replace window.confirm (Round 36 #5) |
| Admin auth | `src/lib/admin-auth.ts` | `requireAdmin()` middleware |
| Audit log | `src/lib/db/admin-audit.ts` | `recordAdminAudit()` toutes les admin actions |
| Slack alerts | `src/lib/alerting/slack.ts` | `sendCriticalAlert()` |
| Cron runs log | `src/lib/cron/runs.ts` + `healthcheck.ts` | `recordCronRun` + `pingCronHealthcheck` |
| Sinalite cache | `src/lib/sinalite/cache.ts` | TTL fast-path + stale fallback |

## Conventions à respecter

### Naming

- **Files** : kebab-case (`order-events.ts`, jamais `OrderEvents.ts`)
- **Components** : PascalCase (`OrderActions.tsx`, `WalletSubscriptionCard.tsx`)
- **Hooks** : `use*` (`useConfirmDialog`)
- **API routes** : `route.ts` (App Router convention)
- **Tests** : `tests/<name>.test.ts` (NOT colocated)

### Commit messages

```
feat|fix|perf|test|chore(scope): summary (Round N #M)

Detail line 1 (why, not what)
Detail line 2

Tests : 1100 pass (était 1095, +5)
```

Pas de co-author trailers, pas de body marketing-style.

### PR title

`feat(reseller): PLATINUM tier (10% off, 20k\$/yr threshold) (Round 33)`

### Round structure

Chaque round = 5 PRs ciblés sur un thème cohérent. Examples :

- Round 30 : 5 audit-driven fixes (pricing, mobile nav, tables, grids, interactive)
- Round 33 : 5 features reseller B2B v2
- Round 38 : 5 self-audit + concurrency + DX

### Adding a new...

#### ...migration

```bash
# Edit prisma/schema.prisma
pnpm exec prisma migrate dev --name short_descriptive_name --create-only
# Edit the generated .sql to wrap in BEGIN/COMMIT (atomic)
# Review, then deploy applies via Prisma's _prisma_migrations table
```

⚠️ Si drift entre dev DB et schema, écrire la migration `.sql` MANUELLEMENT
dans `prisma/migrations/<timestamp>_name/migration.sql` (ne PAS reset).

#### ...cron

1. `src/app/api/cron/<name>/route.ts` — auth `Bearer ${CRON_SECRET}` + `recordCronRun()` + `pingCronHealthcheck()`
2. `.github/workflows/cron-<name>.yml` — `secrets.CRON_SECRET` via `env:` pattern (jamais `${{ github.event.* }}` injection)
3. Register dans `src/app/admin/crons/page.tsx` `CRONS` array (avec `expectedIntervalMs`)
4. Test dans `tests/cron-<name>.test.ts` (vi.mock prisma + sendAdminCustomMessageEmail si email)
5. Run timing : human-facing crons à 13h UTC = 8h EST / 9h EDT (admin éveillé)

#### ...email template

1. `src/lib/emails/templates/<name>.html` — Handlebars-like `{{VAR}}`
2. `src/lib/emails/vars.ts` — Export `<Name>Vars` interface
3. `src/lib/emails/render.ts` — Ajout au `subjectFor` map
4. `src/lib/emails/queue.ts` — Si transactional, ajouter à `THROTTLE_EXEMPT_TEMPLATES`. Si marketing, ajouter à `MARKETING_TEMPLATES`.
5. `src/lib/emails/send.ts` — Wrapper typed `send<Name>Email()`
6. `src/app/admin/email-preview/` — Auto-listé si vars accessible

### Money math rules

- **Always cents** (`Int`) en DB et server-side compute
- **Convert in display layer only** : `formatCents(1234)` → "12,34 $"
- **Pour les % discounts** : `Math.floor` (favors Plio)
- **Pour les bonuses** : `Math.floor` aussi (cohérent)
- **Tax** : source of truth = `order.taxCents` (ce qui a été chargé Stripe)
- **Wallet** : toujours via `recordWalletTx()` (atomic + ledger)

### Status transitions

Use `markOrder*` helpers (`src/lib/db/orders.ts`) — they have optimistic
locking. Direct `prisma.order.update({where:{id}, data:{status}})` est
INTERDIT (race condition silent).

### CSP + headers

`next.config.ts` exporte les SECURITY_HEADERS (Round 36 #2). Si tu ajoutes
un nouveau script externe (analytics, etc.), ajoute son origin au
`script-src` ET `connect-src` de la CSP Report-Only.

### What NOT to do

- ❌ `window.confirm()` / `window.alert()` — use `useConfirmDialog` (Round 36 #5)
- ❌ `console.log` en code prod (eslint-warns, garder pour debug local only)
- ❌ `process.env.X` direct — use `env` from `src/lib/env.ts` (typed + fail-fast)
- ❌ `Promise.all(emails.map(send))` — use `Promise.allSettled` (1 fail ≠ all fail)
- ❌ `prisma.order.update()` pour status — use `markOrder*` helpers
- ❌ Direct `parseFloat(remote.price) * 100` sans `Number.isFinite` guard
- ❌ `git push --force` sur main (jamais — direct-to-main = deploy seulement)
- ❌ Co-author trailers dans les commits (per project convention)

## Test infrastructure

- **Framework** : vitest + happy-dom (config dans `vitest.config.ts`)
- **DB mock pattern** : `vi.mock('@/lib/db', () => ({ prisma: { ... } }))` per-test
- **Stripe mock** : `vi.hoisted(() => ({ ... }))` car SDK init en module-load
- **Test fixtures** : `tests/_fixtures/` (User factory Round 19 #1, Order factory Round 21 #1)
- **No tests for** : Server Components (pas de React Testing Library), Auth.js internals
- **Tests for** : API routes, lib helpers, cron handlers, email shape

## Audit cadence

Pattern stable : **3-4 rounds features puis 1 round audit-driven**. Audits
lancent 5 agents parallèles avec angles complémentaires (security, perf,
end-to-end journeys, etc.). Round 30, 36, 37, 38 = audit-driven mini-rounds.

Si tu ajoutes du code "novel" (nouveau pattern, nouvelle dépendance externe,
nouvelle table DB), pense à un follow-up audit dans le round suivant.

## Production safety

- **Vercel preview** : chaque PR auto-deploy → URL preview pour tester
- **Deploy main** : empty commit `chore: deploy round N — ...` push to main
- **Rollback** : `git revert <commit>` + push main (auto-redeploy)
- **DB rollback** : Neon a `branches` (snapshots) — restore via UI
- **Stripe test mode** : `STRIPE_SECRET_KEY=sk_test_*` pour preview, `sk_live_*` prod
- **Sinalite stage** : `SINALITE_API_BASE=https://api.stage.sinaliteuppy.com` pour preview

## Quick commands

```bash
# Dev
pnpm dev                              # localhost:3000
pnpm exec prisma studio               # DB browser

# Validation (always before commit)
pnpm exec tsc --noEmit
pnpm exec vitest run

# Single test file
pnpm exec vitest run tests/orders-create.test.ts

# Generate migration
pnpm exec prisma migrate dev --name add_xxx --create-only

# Branch + PR cycle
git checkout -b feat/foo
# ... edits ...
git add -A && git commit -m "feat(scope): summary (Round N #M)"
git push -u origin feat/foo
gh pr create --title "..." --body "..."
gh pr merge <num> --squash --delete-branch
git checkout main && git pull --ff-only
```
