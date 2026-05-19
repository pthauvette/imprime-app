# AUDIT Plio — 2026-05-19

Audit complet du site après 13 rounds de features (42 PRs mergés). 4 agents en parallèle ont scanné les pages customer, les pages admin, les API/crons/webhooks, et le schema/migrations/tests/dette.

## TL;DR

| Sévérité | Count | Définition |
|---|---|---|
| **P0** | **9** | Page crash / data leak / impossible de compléter checkout / FK cassées en DB |
| **P1** | **24** | Bouton dead, lien 404, form qui submit pas, exposure légale, monitoring cassé |
| **P2** | **46** | Polish, missing audit log, defense-in-depth, pagination, accessibility |
| **P3** | **~15** | Dead code, stale comments, orphan files |

**Bonne santé générale** :
- Zéro `: any` dans tout `src/`
- Zéro orphan component
- 9 TODOs total
- 3 `console.log` (tous légitimes : logger + instrumentation)
- 38 migrations DB toutes additives, zéro breaking change
- Auth coverage strong sur tous les `/api/admin/**` + `/api/cron/**`
- Stripe webhook avec real HMAC + tolerance + dedup

**Gros smells** :
- `globals.css` à **25 088 lignes** (67 % over budget, target <8k)
- 5 paths critiques sans test (sign-in, order create, loyalty cron, broadcast send, happy-path E2E dormant)
- 4 FK orphan en DB (même pattern que NpsResponse qu'on a fixé)

---

## P0 — Blockers (9)

### Customer-facing (2)
1. **`/sign-up` complètement cassé** — `src/app/sign-up/page.tsx`. Static lift-and-shift, no `<form>`, no `onSubmit`, no `action`. OAuth buttons et submit n'ont pas d'`onClick`/`type=submit`. Inputs ont `value=` hardcodés et pas de `name`. **Users physiquement incapables de signup.** Top-of-funnel acquisition mort.
2. **`/onboarding` avec liens HTML 404** — `src/app/onboarding/page.tsx`. `href="orders.html"`, `href="configure.html"`, `href="welcome.html"`, `href="templates.html"`. Les 5 CTAs 404. Pas d'auth guard.

### API / Webhooks (3)
3. **Sinalite webhook signature OPTIONNELLE** — `src/app/api/webhooks/sinalite/route.ts:48-54`. Si `SINALITE_WEBHOOK_SECRET` manque en prod → accepte ANY unsigned payload → peut avancer orders à DELIVERED. Doit hard-fail en prod si secret missing.
4. **Sinalite webhook timing attack** — même fichier ligne 50. Compare avec `!==` au lieu de `crypto.timingSafeEqual`. Et c'est juste un shared bearer, pas un vrai HMAC du body.
5. **`/api/uploads/presign` MIME bypass possible** — `contentType` client-supplied. Vérifier bucket S3 enforce la même allowlist server-side.

### Schema FK orphans (4)
6. `WebhookEvent.orderId` no `@relation` (schema.prisma:376)
7. `EmailDelivery.attachOrderId` no `@relation` (schema.prisma:454)
8. `ReferralReward.refereeOrderId` no `@relation` (schema.prisma:718)
9. `ContactMessage.orderId` no `@relation` (schema.prisma:767)

---

## P1 — Broken UX & monitoring (24)

### Customer (7)
- `/order/review:545` — T&C `<a href="#">conditions générales</a>` + politique de remboursement → devrait pointer `/legal/terms` + `/legal/refund-policy`. **Legal exposure** (user accepte des liens vers nulle part juste avant payment).
- `/sign-up:63` — T&C `<a href="#">` même problème.
- `/` landing:36 — `<a href="#" className="mkt-brand">Plio.</a>` dead anchor sur home.
- `/contact:109,110,118,119` — footer Carrières/Presse/Specs/Statut tous `href="#"`. Statut devrait pointer `/status` (qui existe).
- `/legal/refund-policy:189,197` — mêmes broken footer items.
- `/not-found:37-39` — suggestion pills FAQ/Templates/Contact tous `href="#"`.
- `/referrals` — static placeholder dupliqué de `/account/referrals`. Counts hardcodés, code `PATRICK-25` hardcodé, tous les boutons share dead.

### Admin (10)
- `admin/templates/page.tsx:66-72` — "+ Nouveau template" disabled, category pills sans Link.
- `admin/templates/[slug]/edit/page.tsx:150-156` — route reachable mais "Modifier" disabled. Dead route.
- `admin/users/[id]/page.tsx:724-731` — Danger-zone "Forcer déconnexion" + "Supprimer compte · GDPR" disabled. **PIPEDA non-fulfillable depuis l'UI** alors que `admin/notifications` les surface comme critical.
- `admin/webhooks/page.tsx:190,400,423` — "⚡ Test endpoint", "↻ Replay 24h", "↻ Replay failed" tous disabled.
- `AdminSidebar.tsx:188` — "Réglages" link → `/admin` (= dashboard). Pas de `/admin/settings`.
- AdminSidebar manque entrées pour `/admin/finances/products` + `/admin/finances/tax-report`.
- Sidebar counts hardcoded `webhooks: 3, templates: 3, products: 468` sur 6 callsites.

### API monitoring (7)
- `cron/daily-summary` + `cron/email-retry` + `cron/re-engagement` : **pas de try/catch outer** → si throw, `recordCronRun('fail')` + healthcheck `fail` jamais appelés. Healthchecks.io détecte uniquement via missing-ping timeout.
- `/api/health` : expose `checks.api.stripe.detail` (balance Stripe live) sur endpoint **unauth + wildcard CORS**. **Anyone polls ta balance.**
- `/api/designs/[id]/pdf` : no auth, no ownership check → guess un id = download PDF.
- `/api/emails/pixel/[id]` : id sanity check seulement, pas de cuid shape.
- `/api/search` + `/api/admin/search` : pas de Zod, pas de length cap sur `q`.

---

## P2 — Polish / consistency / hygiene (46)

### Customer (9)
- `/sign-up:36,40,46,53` — `<label>` pas associés (no htmlFor/id).
- `/contact:19-23` — nav linke `/contact` 2x (Aide + Contact).
- `/onboarding:182` — "Aide → Re-faire le tour" `href="#"`.
- `/referrals:235` — "Voir les conditions complètes" `href="#"`.
- `/order/shipping:222,439` + `/settings:214` — `gridTemplateColumns` won't reflow <600px.
- `/design-system:511` — `Sauvegardé · 12s` placeholder pas strippé.
- `/design-system` — hardcoded `value="patrick@plio.ca"` etc., disable en prod.

### Admin (30)
- **5 routes admin action sans `recordAdminAudit`** : `orders/[id]/cancel`, `orders/[id]/refund`, `orders/[id]/replay-sinalite`, `orders/[id]/resend-confirmation`, `broadcast/test`.
- **23/30 pages admin sans defense-in-depth role check** (juste middleware) : si middleware loosened → leak.
- **Missing pagination / unbounded findMany** sur : `admin/nps`, `admin/finances` (3 queries), `admin/finances/products`, `admin/messages/reviews/samples/quotes/reseller-applications/newsletter/promo-codes` (cap take 100, pas d'UI).
- **No try/catch** sur 5+ Prisma queries parallèles : `admin/page.tsx`, `finances/page.tsx`, `notifications/page.tsx` → un missing migration = 500 dashboard. Pattern `.catch(() => [])` d'`experiments/page.tsx` à généraliser.

### API (7)
- `/api/nps` : pas de rate limit, fire Slack on score≤6.
- `/api/abandoned-cart` : public POST, pas de HMAC token email → pollue table + déclenche recovery emails pour emails arbitraires.
- `/api/abandoned-cart:39-46` : `findFirst` sans UNIQUE `(email, productId)` → race possible.
- `/api/health` : wildcard CORS inutile pour monitoring.
- `/api/auth/sinalite/token` : NODE_ENV gate seulement, leak `SINALITE_API_BASE` en staging. Tighten avec requireAdmin().
- `cron-email-retry` `*/5 * * * *` : vérifier idempotent sous overlap.
- 5 routes admin export PII : confirm chaque a AdminAuditLog (juste requireAdmin vérifié).

---

## P3 — Nice to have

- `/onboarding` doit redirect/410 (HTML lift stale, real flow = OnboardingTour modal sur /).
- `/referrals` top-level dead orphan → redirect ou remove.
- Tous les headers "Auto-migrated from Open Design HTML artifact" à stripper.
- `/orders/page.tsx` doc "Auth.js n'étant pas encore branché" est stale.
- Extract `<MarketingFooter />` (dup /contact + /legal/refund-policy).
- `admin/finances/page.tsx:106-107` TODO : refund assumed = order total → matériel bug pour partial refunds.
- `admin/audit/page.tsx:70-71` : ternary dead (`source === 'admin' ? PAGE_SIZE : PAGE_SIZE`).

---

## Schema / Migrations

- **38 migrations** : zéro DROP COLUMN, zéro RENAME, zéro ADD NOT NULL sans DEFAULT. **Toutes safe.**
- **52 `@@index`** : coverage globalement complète. Minor : pas d'index `(eventType, processedAt)` sur WebhookEvent (admin filtering slow at scale).
- **4 FK orphan** listées en P0 (même pattern que NpsResponse qu'on a fixé Round 13).

---

## Tests

### Coverage matrix
| Path critique | Unit | E2E |
|---|---|---|
| Sign-in (magic link) | ✗ | partial (render only) |
| Order create | ✗ (fragments via webhooks) | gated (jamais run) |
| Stripe webhook → PAID | ✓ | ✗ |
| Sinalite webhook → SHIPPED | ✓ | ✗ |
| Abandoned-cart cron | ✓ | ✗ |
| Refund flow | ✓ | ✗ |
| Loyalty tier cron | partial (pure func) | ✗ |
| Broadcast send | partial (recipients) | ✗ |
| NPS submit | ✓ | partial |
| Newsletter signup | ✓ | ✗ |
| Admin order cancel | partial | ✗ |

### CI status
- `ci.yml` run `pnpm vitest run` blocking sur PRs ✓
- `e2e.yml` run UNIQUEMENT `smoke.spec.ts` après push prod. Happy-path + new-pages **PAS dans CI**.
- `happy-path.spec.ts` gated par `E2E_FULL_FLOW=1` + PDF fixture manquante → effectivement dormant.

---

## Tech Debt — Inventaire

- TODO/FIXME/XXX/HACK : **9** (très low). Top : `admin/finances/page.tsx` (2).
- `console.log` in src : **3** (tous légitimes).
- `: any` types : **0**.
- Orphan components : **0**.
- `globals.css` : **25 088 lignes** (>15k threshold). **Strong dead-rule risk.**

**Tech debt level : LOW** — sauf le globals.css.

---

## Cron health matrix

| Cron | Route | Workflow | CRON_SECRET | CronRun success/fail | Healthcheck success/fail |
|---|---|---|---|---|---|
| cleanup | ✓ | ✓ (0 6 * * *) | ✓ | success+fail | success+fail |
| daily-summary | ✓ | ✓ (0 11 * * *) | ✓ | **success only** | **success only** |
| email-retry | ✓ | ✓ (*/5 * * * *) | ✓ | **success only** | **success only** |
| abandoned-cart | ✓ | ✓ (40 * * * *) | ✓ | success+fail | success+fail |
| re-engagement | ✓ | ✓ (0 14 * * *) | ✓ | **success only** | **success only** |
| loyalty-tiers | ✓ | ✓ (0 5 1 * *) | ✓ | success+fail | success+fail |

---

## Webhook safety matrix

| Webhook | Signature | Idempotent | 200 only on success |
|---|---|---|---|
| stripe | ✓ real HMAC + tolerance | ✓ WebhookEvent dedup | ✓ |
| sinalite | **conditional + timing-unsafe + shared secret** | ✓ fingerprint dedup | ✓ |

---

## Pages clean (zéro issue)

**Customer (38/45)** : `/about`, `/blog`, `/blog/[slug]`, `/quote`, `/samples`, `/reseller`, `/help`, `/templates`, `/pricing`, `/track`, `/search`, `/status`, `/sign-in`, `/sign-in/sent`, `/order/start`, `/order/product`, `/order/configure`, `/order/quantity`, `/order/upload`, `/order/shipping`, `/order/confirmation`, `/orders`, `/orders/[id]`, `/account`, `/account/favorites`, `/account/referrals`, `/wallet`, `/addresses`, `/payments`, `/drafts`, `/settings`, `/settings/email-preferences`, `/settings/privacy`, `/legal/privacy`, `/legal/terms`, `/newsletter/unsubscribe`, `/reviews/submit`, `/design/[slug]`.

**Admin (6/30)** : `admin/orders/quick-link`, `admin/search`, `admin/orders/[id]`, `admin/email-preview`, `admin/webhooks/[id]`, `admin/experiments`.

---

## Round 14 — Plan de fixes prioritaire

Recommandation : **5 PRs ciblés P0 + P1 critiques**. Pas de nouvelle feature jusqu'à ce que ces fixes soient mergés.

### PR 1 — `/sign-up` + `/onboarding` (P0 customer)
- Réécrire `/sign-up` avec un vrai form + server action (ou redirect vers `/sign-in` magic-link si on garde uniquement magic-link).
- Strip ou redirect `/onboarding` (OnboardingTour modal sur `/` est le real flow).
- Fix T&C `href="#"` sur `/sign-up` + `/order/review` + `/not-found` + `/contact` + `/legal/refund-policy`.

### PR 2 — Sinalite webhook hardening (P0 API)
- `SINALITE_WEBHOOK_SECRET` requis en prod (hard-fail si missing, comme CRON_SECRET).
- Replace `!==` par `crypto.timingSafeEqual`.
- (Stretch : passer à un vrai HMAC du body avec timestamp tolerance, comme Stripe.)

### PR 3 — 4 FK orphan + presign MIME enforcement (P0 schema + API)
- Migration : ajouter `@relation` + FK CASCADE sur `WebhookEvent.orderId`, `EmailDelivery.attachOrderId`, `ReferralReward.refereeOrderId`, `ContactMessage.orderId`. Pattern identique à `20260519410000_nps_order_relation`.
- `/api/uploads/presign` : verify le bucket S3 enforce MIME server-side via policy.

### PR 4 — 3 crons sans fail signal + `/api/health` lock-down (P1 monitoring)
- Wrap `daily-summary`, `email-retry`, `re-engagement` dans try/catch avec `recordCronRun('fail')` + `pingCronHealthcheck('fail')`.
- `/api/health` : retirer `checks.api.stripe.detail` du public response (ou gate behind token). Drop wildcard CORS.

### PR 5 — Admin dead buttons (P1 admin) + AdminSidebar consistency
- Webhooks "Test endpoint" + "Replay 24h" + "Replay failed" : implémenter OU remove.
- `admin/templates/[slug]/edit` : ship l'editor OU 404 la route.
- `admin/users/[id]` danger-zone : ship "Force logout" + "Delete account PIPEDA" (API routes + audit log) OU expliquer "feature pas encore dispo".
- AdminSidebar : fix "Réglages" link, ajouter `/admin/finances/products` + `/tax-report`, remplacer counts hardcodés par vrais counts (déjà calculés ailleurs).

### Hors Round 14 (bonus si temps)
- `/api/designs/[id]/pdf` ownership check.
- 5 routes admin actions sans audit log → ajouter `recordAdminAudit`.
- Defense-in-depth `requireAdmin()` sur les 23 pages admin qui n'en ont pas (5 min/page).
- Pagination UI sur admin/messages/reviews/samples/quotes/reseller-applications/promo-codes.
- Wrapper `.catch(() => [])` sur Prisma parallèles dans admin dashboard.
- `tests/orders-create.test.ts` + `tests/cron-loyalty-tiers.test.ts` + activer happy-path E2E en nightly.
- CSS purge pass `globals.css` 25k → <8k.
