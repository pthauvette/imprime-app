# Imprime — BFF (Backend for Frontend)

Backend Next.js qui consomme l'API Sinalite (`api.sinaliteuppy.com` sandbox /
`liveapi.sinalite.com` prod) et expose une couche unifiée pour le front
Imprime (28 pages designed dans Open Design).

**Stack** : Next.js 15 App Router · TypeScript strict · Zod schemas ·
Stripe SDK · Node 20+.

---

## Quickstart

```bash
cp .env.example .env.local
# Remplis SINALITE_CLIENT_ID, SINALITE_CLIENT_SECRET, STRIPE_SECRET_KEY

pnpm install
pnpm dev          # → http://localhost:3000
pnpm typecheck    # vérifie les types

# Stripe webhook en local
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# → copie le whsec_… dans STRIPE_WEBHOOK_SECRET de .env.local
```

Test rapide :
```bash
curl http://localhost:3000/api/products | jq '.total'
# → ~1200
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT (front Imprime — converti des designs HTML)     │
└──────────────────────┬──────────────────────────────────┘
                       │ fetch
┌──────────────────────▼──────────────────────────────────┐
│  BFF Next.js (ce repo)                                   │
│                                                          │
│  /api/products           — catalogue                     │
│  /api/products/[id]      — détails + options + prix      │
│  /api/products/[id]/variants — matrice prix (md5)        │
│  /api/shipping/estimate  — UPS/FedEx                     │
│  /api/orders             — liste paginée                 │
│  /api/orders/[id]        — détail + items                │
│  /api/orders/create      — Stripe PaymentIntent          │
│  /api/webhooks/stripe    — déclenche Sinalite /order/new │
│  /api/webhooks/sinalite  — status push                   │
│                                                          │
│  Token cache (24h JWT) · md5 pricing · taxes par prov.   │
└──────┬─────────────────────────────────────┬─────────────┘
       │                                     │
       │ Bearer JWT                          │ webhook
┌──────▼──────────────┐         ┌────────────▼────────────┐
│  SINALITE API       │         │  STRIPE                  │
│  (sandbox / prod)   │         │  (PaymentIntent → wallet)│
└─────────────────────┘         └──────────────────────────┘
```

---

## Découvertes API critiques (mai 2026)

Ces points sont contre-intuitifs ou contredisent la doc publique de Sinalite.
Tous baked into ce code.

| Découverte | Détail |
|---|---|
| `storeCode` | C'est la **string** `"en_ca"` ou `"en_us"`, **pas** le `6` / `9` numérique mentionné dans la doc principale |
| Endpoint variant lookup | C'est `/pricebykey/{id}/{key}` (et **pas** `/pricedbykey`) |
| Pricing local | `md5(sortedOptionIds.join('-'))` → lookup dans `pricing[]` de `/product/{id}/{storeCode}`. Permet du O(1) sans roundtrip |
| Endpoints cachés | `GET /order/list/{offset}` et `GET /order/{id}` ne sont pas dans la doc publique mais existent |
| Wallet model | `/order/new` débite le **wallet Sinalite préchargé** (pas de Stripe direct vers eux). Le client paie *toi* via Stripe, *toi* paies Sinalite via wallet |
| Webhook | Configurable côté Account → "Status Update Callback URL" pour recevoir les changements de statut en push |
| Roll labels | Data structure différente (options en objet, exclusions, content_type). Pricing API-only, pas de matrice locale |
| Custom sizes | Si metadata contient `"custom_size"`, on peut passer `"5x6"` (string) au lieu d'un option ID |
| Item.extra | Champ optionnel pour ID interne reseller — utile pour reconciliation |
| CORS | Sinalite whitelist les domaines pour appels browser direct. **Mais** : avec ce BFF, on appelle server-to-server → zéro problème CORS |

---

## Modèle de paiement (important)

```
1. Client front-end clique « Confirmer »
2. POST /api/orders/create
   → server recompute le total côté serveur (anti-tampering)
   → crée un Stripe PaymentIntent
   → retourne { clientSecret } au front
3. Front confirme le paiement avec Stripe Elements (le client est débité)
4. Stripe envoie payment_intent.succeeded à /api/webhooks/stripe
5. Le webhook reconstitue le payload Sinalite depuis la metadata
6. POST /order/new vers Sinalite (débite le wallet préchargé)
7. Si Sinalite OK → enregistre mapping (paymentIntentId → sinaliteOrderId) en DB (TODO)
8. Si Sinalite KO → refund automatique du paiement Stripe
```

⚠️ **Avant la prod**, configure dans le dashboard Sinalite :
- Account → Manual Approval = NO (sinon les commandes attendent)
- Account → Send Order Confirmation Email = NO (envoie tes propres emails branded)
- Account → Web Hooks → Status Update Callback = `https://imprime.co/api/webhooks/sinalite`

---

## TODOs avant prod

- [ ] **DB** (Postgres / Supabase) :
  - `orders` (paymentIntentId, sinaliteOrderId, status, customerEmail, createdAt)
  - `addresses` (userId, isDefault, ship/bill, ...)
  - `webhooks_processed` (eventId) pour idempotence
- [ ] **Auth** : intégrer Auth.js / Clerk / Lucia. Ajouter middleware sur `/api/orders*`.
- [ ] **Upload artwork** : intégrer S3 / R2 / UploadThing → renvoie l'URL publique pour `files[].url` du payload Sinalite.
- [ ] **Address autocomplete** : Canada Post AddressComplete API (limit `country=CA`).
- [ ] **SSE live tracking** : endpoint `/api/orders/stream` qui pipe les events du webhook Sinalite aux clients connectés.
- [ ] **Email branded** : Resend ou Postmark pour envoyer les emails à TON nom (pas Sinalite).
- [ ] **Cache produits** : `/api/products` renvoie ~1200 items à chaque appel — ajouter SWR / Vercel Edge Cache (1h TTL).
- [ ] **Idempotence webhooks** : hash le `event.id` Stripe pour ne pas créer deux orders Sinalite au retry.
- [ ] **Observability** : Sentry pour les erreurs, Vercel Analytics pour le perf.
- [ ] **Tests** :
  - Unit : `lib/sinalite/pricing.ts` (md5 lookup), `lib/taxes/index.ts` (5 régimes provinciaux)
  - Integration : MSW + sinalite mocks pour `/api/orders/create`
  - E2E : Playwright sur le wizard complet contre la sandbox Sinalite

---

## Pages à porter (depuis Open Design)

Les 28 designs HTML générés dans le projet `imprime` d'Open Design sont à
convertir en composants React Server / Client de cette app :

| HTML source (Open Design) | Route Next.js cible |
|---|---|
| `landing.html` | `/` |
| `signin.html` / `signup.html` / `magic-link-sent.html` | `/sign-in` |
| `welcome.html` → `confirmation.html` (8 wizard) | `/order/[step]` |
| `orders.html` / `order-detail.html` | `/orders` / `/orders/[id]` |
| `wallet.html` / `payments.html` | `/account/wallet` / `/account/payments` |
| `addresses.html` / `drafts.html` / `referrals.html` | `/account/...` |
| `samples.html` / `templates.html` | `/samples` / `/templates` |
| `pricing.html` / `reseller.html` / `help.html` | `/pricing` / `/reseller` / `/help` |
| `account-settings.html` | `/account/settings` |
| `not-found.html` / `error-500.html` | `app/not-found.tsx` / `app/error.tsx` |

Stratégie de migration :
1. Copier `tokens.css` + `components.css` du projet Open Design dans `src/app/globals.css`
2. Pour chaque page : extraire le markup, transformer en composants, brancher au BFF via `fetch('/api/...')`
3. Utiliser Server Components par défaut, `'use client'` uniquement pour les interactions (wizard state, Stripe, etc.)
