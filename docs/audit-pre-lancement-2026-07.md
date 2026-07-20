# Audit pré-lancement + roadmap — 2026-07-20

Audit multiagent (7 rapports : blocages lancement · money-path adversarial ·
sécurité/Loi 25 · authz · S3/PII · ops/build) réalisé juste après la migration
Neon → Supabase, sur une base **repartie à neuf** et une app **pas encore
ouverte au public**.

## Verdict

**Ne pas ouvrir la boutique en l'état.** Le code est globalement sain — authz
exemplaire, invariants money intacts, aucune faille critique d'autorisation —
mais **trois défauts de configuration font perdre de l'argent à chaque commande**
et **plusieurs promesses écrites ne correspondent pas au comportement du code**
(risque réglementaire Loi 25).

Aucun de ces bloquants n'est un bug de logique : ce sont des **valeurs par
défaut dangereuses** et des **écarts entre le dit et le fait**.

---

## P0 — Bloque l'ouverture

### P0-1 🔴 Vente au coût Sinalite sur 100 % des commandes
`src/lib/products/pricing.ts:46-47`

```ts
const marginPct = override?.marginPct ?? null;
const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;
```

`ProductOverride` est **vide** → multiplicateur 1 → le prix facturé **est** le
prix de gros Sinalite. Les 10 chemins de prix sont touchés (checkout web, devis
MCP, configurateur, listes, cartes) — aucune fuite, mais cohéremment à perte.

Chiffrage : 500 cartes à 47,21 $ de coût → encaissé 47,21 $, payé 47,21 $,
Stripe 1,67 $ → **perte sèche**. Avec les avantages empilés (revendeur −5 %,
promo, port GOLD absorbé) : **≈ 374 $ de perte sur une commande de 2 000 $**.
Le checkout web n'a aucun plafond de montant. **La perte croît avec le succès.**

Aggravants — les avantages sont accordés automatiquement :
| Avantage | Fichier | Coût |
|---|---|---|
| Promo BIENVENUE **auto à l'inscription**, sans opt-in | `src/lib/promo/welcome.ts:17` | −25 $ dès 100 $ |
| Parrainage (deux côtés) | `src/lib/referrals/code.ts:14` | −20 $ |
| Bonus recharge wallet | `src/lib/wallet/tiers.ts:23` | jusqu'à +12 % |
| Remise revendeur | `src/lib/reseller/perks.ts:24` | −5 % / −10 % |

**Action** : poser les marges (`/admin/products`) **avant** toute commande. Puis
laisser tourner `refresh-product-prices` (~5 h) pour que les listes affichent le
bon prix. Aucun setter en masse n'existe (`updateMany` absent des routes admin).

### P0-2 🔴 Le fail-open survit à la configuration des marges
`src/lib/products/pricing.ts:64-72`

```ts
async function fetchOverride(productId: number) {
  try { return await prisma.productOverride.findUnique({ … }); }
  catch { return null; }   // erreur DB indistinguable de « aucune ligne »
}
```

Une **erreur DB** produit le même `null` qu'une absence de config → cette
commande part **à prix coûtant même avec les marges configurées**, et un produit
`disabled` redevient commandable. Invisible : le recalcul serveur retombe sur la
même valeur → aucun `PRICE_MISMATCH`, tous les invariants disent OK.

Le pooler Supabase rend ces erreurs transitoires **plus probables** qu'avec Neon
(surtout si `?pgbouncer=true` manque → `prepared statement already exists`).
Risque passé de théorique à opérationnel.

**Correctif recommandé** (~10 lignes) : plancher `DEFAULT_MARGIN_PCT` (env)
quand `marginPct` est `null` — le code distingue déjà `null` (non configuré) de
`0` (marge nulle voulue), donc aucune ambiguïté ; **et** cesser d'avaler
l'erreur DB (propager → throw). Un produit qui refuse de s'afficher est un
incident visible ; un produit vendu à perte est invisible.

### P0-3 🔴 Sinalite pointe sur le SANDBOX
`src/lib/sinalite/client.ts:51-53` → défauts `api.sinaliteuppy.com` (sandbox).
`liveapi.sinalite.com` **n'apparaît nulle part dans `src/`**.

**Symptôme** : Stripe encaisse, la commande part au sandbox, **rien n'est
imprimé ni expédié**. Aucune erreur.

**Action** : poser `SINALITE_API_BASE` + `SINALITE_AUTH_BASE` sur
`liveapi.sinalite.com`, **et** `SINALITE_WEBHOOK_SECRET` (sans lui : 503
fail-closed → aucun suivi de commande ne remonte jamais).

### P0-4 🔴 Deux garde-fous OFF **et impossibles à activer**
`amplify.yml:51` filtre les env par préfixe. **Aucun** de ces noms ne matche :
`ENFORCE_SHIPPING_SIG`, `FILE_REVALIDATION`, `ORDER_CANCEL_FEE_CENTS`,
`REFERRAL_REWARD_CENTS`, `GOLD_FREE_SHIPPING_CAP_CENTS`. Les poser dans la
console **n'a aucun effet au runtime**.

Conséquences : le `shippingPrice` fourni par le client est **facturé tel quel**
(`price-order.ts:188`, log-only) et **aucune revalidation serveur des PDF** sur
le tunnel web — alors que le même contrôle est fail-closed côté MCP.

**Action** : ajouter les préfixes à la whitelist (PR), puis
`ENFORCE_SHIPPING_SIG=1` et `FILE_REVALIDATION=log` → `enforce`.

### P0-5 🔴 Secrets de signature avec repli public `'dev-secret'`
`quote-token.ts:42`, `retry-token.ts:19`, `click-token.ts:18`,
`newsletter/token.ts:14`, `reviews/token.ts:10` → `process.env.AUTH_SECRET ?? 'dev-secret'`.

Le fail-fast est **désarmé** (`env.ts:100`, `instrumentation.ts:38` avale
l'exception) → si `AUTH_SECRET` manque, le serveur démarre et **signe avec une
constante publiée dans le dépôt**. `shippingQuoteToken` est justement le jeton
que `ENFORCE_SHIPPING_SIG` valide → forge d'un devis à `price: 0`.
`paymentRetryToken(orderId)` est déterministe et sans expiration.

**Correctif** : supprimer le repli. Un module de signature doit **refuser de
signer**, pas signer faux.

### P0-6 🔴 Factures avec numéros de taxe factices
`src/lib/company/identity.ts:28-30` → `'(num. TPS à venir)'`, rendu sur la
facture PDF, le courriel de confirmation et les CGU — pendant que `computeTax`
facture TPS 5 % + TVQ 9,975 %. Percevoir la taxe sans afficher les numéros
contrevient aux **art. 169 LTA / 350 LTVQ**.

---

## P1 — Conformité Loi 25 (écarts entre le dit et le fait)

### P1-1 🔴 La suppression PIPEDA ne supprime pas les fichiers — et le courriel affirme le contraire
`grep DeleteObject` sur tout le dépôt → **zéro résultat**. La route
`delete-pipeda` est excellente (anonymisation transactionnelle de 10 tables,
audit) mais **ne touche jamais S3**. Le courriel affirme « designs → supprimés ».
C'est faux : le PDF reste `public-read` indéfiniment. **Art. 28.1.**
La rétention « 2 ans » annoncée (`privacy/page.tsx:205`) n'est appliquée par
aucun code.

### P1-2 🔴 La politique nomme le mauvais sous-traitant
`privacy/page.tsx:142,179` annonce « Neon Postgres (USA) ». La réalité depuis
aujourd'hui : **Supabase, ca-central-1 (Montréal)**. Sous-traitant réel **omis**
(art. 8). Correction textuelle, coût quasi nul.

### P1-3 🟠 Les designs clients sont publics
`s3.ts:145` → `acl: 'public-read'`. URL indevinable (UUID 122 bits) mais **aucun
contrôle d'accès**, et elle **fuit par construction** : transmise à Sinalite,
présente dans les courriels, et **`files=` est interpolé dans le lien de relance
panier** (`AbandonedCart.resumeQuery`, `cron/abandoned-cart/route.ts:111`).
Un design contient couramment de la PII. **Art. 10.**

### P1-4 🟡 Lien magique en clair dans les logs
`src/auth.ts:76` — `email` censuré, **`url` non**. En CloudWatch, c'est une prise
de contrôle de compte. Autres fuites : `console.warn` hors Pino avec le body
Sinalite (`orders/[id]/route.ts:52`), `vars` d'emails contenant
`CUSTOMER_NAME`/`SHIP_ADDRESS_HTML` (`render.ts:164`).

### P1-5 🟠 Compte invité partagé — seul vrai défaut d'authz
`designs/finalize/route.ts:31` — `GUEST_EMAIL = 'guest@plio.local'`, **une seule
row pour tous les invités**. Le commentaire affirme qu'un `draftId` d'autrui « ne
matche rien » : vrai entre comptes réels, **faux entre invités**. Un invité qui
obtient un `draftId` peut **écraser le design** d'un autre.

### P1-6 🟡 Portabilité annoncée, non outillée
`privacy/page.tsx:235` promet un export JSON sous 30 j. Aucune implémentation.

---

## P2 — Robustesse opérationnelle

### P2-1 🔴 `NODE_OPTIONS=6144` sur 4 Go **garantit** le SIGKILL
`amplify.yml:72`. Dire à V8 qu'il peut monter à 6 Go sur un conteneur de 4 Go le
fait dépasser le cgroup → **tué par le noyau** au lieu d'une erreur heap lisible.
**Pic RSS mesuré : 3,18 Gio / 4 Go (~20 % de marge).**
→ Immédiat : **3072**. Durable : compute **Large (8 Go)**, puis remonter.

### P2-2 🔴 Le quoting `.env.production` reste cassé sur `$`, `"`, `\`
`amplify.yml:52`. Testé avec le vrai `@next/env` : `#` ✅ · `$` ❌ (`pa$ss` → `pa`)
· `"` ❌ · `\` ❌. **`$` est pire que `#`** : il produit une URL *valide* → erreur
d'authentification opaque au lieu d'un message clair.
Fix vérifié 4/4 : guillemets simples + `$` échappé.

### P2-3 🔴 `|| true` avale l'incident de 2026-05-30
`amplify.yml:53`. Si le grep/sed échoue, le build continue avec un
`.env.production` vide. Remplacer par `set -euo pipefail` + assertions de forme
(≥ N vars, clés critiques présentes, `DATABASE_URL` a un port).

### P2-4 🔴 La cause d'un échec de build est illisible sans console AWS
C'est ce qui a coûté la journée : 4 cycles × 15 min.
**Les creds AWS existent déjà** en secrets GitHub (`db-backup.yml:44`). Il
manque `amplify:ListJobs` + `amplify:GetJob` et un workflow qui fait
`aws amplify get-job` puis `curl` du log en cherchant les signatures connues
(`heap out of memory`, `exit 137`, `P1001`, `invalid port`…).

### P2-5 🟠 `prisma migrate deploy` en preBuild couple la DB à tout déploiement
`amplify.yml:14`. Une DB injoignable bloque un changement CSS. Le couplage a une
vertu réelle (le schéma précède toujours le code). Options, dans l'ordre :
**(b)** ping DB 10 s avant, message distinguant P1001 d'un échec de migration
(5 lignes, à faire tout de suite) → **(a)** migrations dans un job GitHub dédié
(découple, log visible) → **(c) tolérer l'échec : à rejeter** (on déploierait du
code contre un schéma périmé).

### P2-6 🟠 La validation qui aurait attrapé le bug est du code mort
`env.ts:24` — le schéma zod **rejette bien** l'URL tronquée (vérifié). Mais
`parseEnv()` ne throw plus (`:99`), `assertProductionEnvReady()` ne teste que la
**présence** (`:144`), et **aucun module** n'importe `env`. Le signal a
probablement été émis dans CloudWatch — précisément là où on n'avait pas accès.
⚠️ Nuance : `z.string().url()` rejette aussi un `#` **légitime** dans un mot de
passe — ne pas durcir en `throw` sans traiter ce cas.

### P2-7 🟠 Zéro test sur le pipeline de config (0 / 190)
Le bug du `#` **était attrapable** par un test unitaire lisant le `sed` d'
`amplify.yml` et le rejouant via le vrai loader Next. Deux autres tests à très
bon rapport : `SERVER_ENV_KEYS` ⊆ whitelist `amplify.yml`, et clés de
`assertProductionEnvReady()` ⊆ whitelist.

### P2-8 🟡 Les leviers mémoire sont épuisés
`webpackMemoryOptimizations`, lint off, typecheck off — il ne reste **rien** dans
`next.config.ts`. Le prochain dépassement exigera la compute Large.
⚠️ La sûreté du typecheck désactivé dépend du check requis GitHub, invisible
depuis le code.

### P2-9 🟡 Abus / coût — rate-limit fail-open
`ratelimit.ts:24` — sans Upstash, **tous** les limiteurs valent `null`
(fail-open silencieux). `/api/orders/create` n'a **aucun** rate-limit alors qu'il
crée un PaymentIntent Stripe. `/api/health` est public, verbeux (SHA, erreurs
brutes) et déclenche un appel Sinalite + Stripe **réels** à chaque hit.
*(Ce finding est remonté par 3 audits indépendants — priorité supérieure à sa
sévérité individuelle.)*

---

## Ce qui est sain (vérifié, pas supposé)

- **Invariants money intacts après migration** : garde montant
  (`stripe-process.ts:375`), transitioned-guard (`:424`), idempotence webhook,
  anti-double-crédit (reserve-at-create + `FOR UPDATE`), Mode B fail-closed.
- **Les verrous tiennent à travers le pooler** : tous les `FOR UPDATE` sont dans
  des transactions interactives, que Supavisor **épingle**. Aucun advisory lock
  de session (qui, lui, aurait cassé).
- **Authz exemplaire** : 40/40 routes `/api/admin/**`, 31/31 pages, 19/19 crons
  fail-closed avec comparaison à temps constant, MCP doublement verrouillé
  (aucun IDOR), webhooks signés, CSRF sur toute mutation.
- **Aucun secret dans le bundle client** — prouvé avec contrôle positif (la clé
  publique Stripe est bien détectée par la même méthode).
- **Droit à l'effacement réellement implémenté** (pas juste enregistré), seule
  lacune S3.
- **Consentement marketing propre** : aucune case pré-cochée, `emailMarketing`
  false par défaut, preuve CASL conservée.
- **XSS stocké impossible** : allowlist MIME + condition de policy que **S3 fait
  respecter côté serveur**.
- **19 crons sains sur base vide** : audit adversarial → divisions gardées,
  deltas `null`, retours anticipés. Rien ne spammera Slack.
- **Aucun seed nécessaire** : architecture code-first. Le premier admin se
  bootstrappe via `ADMIN_EMAILS`.

---

## Roadmap

### Lot 1 — Débloquer l'ouverture (code, ~1 j)
1. **P0-2** plancher `DEFAULT_MARGIN_PCT` + arrêt du `catch` silencieux → money-path-reviewer obligatoire
2. **P0-4** préfixes manquants dans la whitelist `amplify.yml`
3. **P0-5** suppression des replis `'dev-secret'`
4. **P2-1/2/3** heap 3072 + `sed` corrigé (`$`) + assertions `set -euo pipefail`
5. **P2-7** tests du pipeline de config

### Lot 2 — Config prod (Patrick, console)
6. **P0-1** marges dans `/admin/products`, puis attendre `refresh-product-prices`
7. **P0-3** `SINALITE_*` → `liveapi` + `SINALITE_WEBHOOK_SECRET`
8. **P0-6** numéros TPS/TVQ/NEQ ; sortie du sandbox SES ; clé Stripe `sk_live_`
9. Vérifier `UPSTASH_*`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `ADMIN_EMAILS`
10. Compute Amplify **Large** ; **listing du bucket S3** (si ouvert, l'UUID ne protège plus rien)

### Lot 3 — Conformité (avant de communiquer publiquement)
11. **P1-2** Neon → Supabase dans la politique *(30 min, exposition directe)*
12. **P1-1** purge S3 dans la route PIPEDA + cron 2 ans, **ou** corriger le courriel
13. **P1-3** retirer l'ACL `public-read` → presigned GET ; sortir `files=` du `resumeQuery`
14. **P1-4** redaction de `url` (lien magique) + les 3 fuites de logs
15. **P1-5** cloisonner les invités (cookie signé au lieu du compte partagé)

### Lot 4 — Robustesse (après ouverture)
16. **P2-4** workflow de récupération du log Amplify *(le meilleur ratio de tout le document)*
17. **P2-5** option (b) puis (a) — découplage des migrations
18. **P2-9** rate-limits manquants, `/api/orders/create` en tête
19. **P2-6** faire valider le **format** par `assertProductionEnvReady` + check `config:env` dans `/api/health`

### Ordre de vérification finale
Commande test réelle de bout en bout : paiement → Sinalite **live** → webhook de
statut → facture PDF → courriel.

---

## Réserves méthodologiques

Analyse **statique**, sans accès à la console Amplify ni aux env vars réellement
posées. Tous les items « poser telle variable » supposent une vérification que
seul Patrick peut faire. Les chiffres mémoire viennent d'un build local à cache
chaud (ordre de grandeur fiable, valeur absolue moins) — d'où la recommandation
de **mesurer en CI** plutôt que de faire confiance au nombre.

Deux correctifs livrés le 2026-07-20 se sont révélés défectueux et sont corrigés
par le lot 1 : `NODE_OPTIONS=6144` (#453, contre-productif sur 4 Go) et le
quoting `.env.production` (#458, incomplet sur `$`/`"`/`\`).
