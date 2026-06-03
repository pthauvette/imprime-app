<!--
  Audit multiagent premium v2 — généré le 2026-06-02
  Méthode : 16 dimensions auditées en parallèle (lecture du vrai code) → vérification
  adversariale de CHAQUE finding (réfuter par défaut) → synthèse.
  115 agents · 98 findings bruts → 93 confirmés
  (critical:3 high:18 medium:36 low:36).
  Run: wf_12462a4d-2ed
-->

# Roadmap d'audit premium — Plio (imprime-app)

## 1. Résumé exécutif

La posture globale est **saine mais avec des trous monétaires sérieux** : l'app a déjà subi 9 rounds de durcissement (FSM optimiste, gardes atomiques wallet, dédup webhook, click-tokens HMAC), et la majorité des findings sont des *angles morts résiduels* plutôt que des régressions massives. Le **thème dominant n°1 est l'argent** : plusieurs chemins de refund/cancel/échec ne restaurent pas le crédit wallet/referral, le webhook Sinalite CANCELLED envoie un email « remboursé » sans rembourser, et `processWalletTopup` n'a aucune idempotence DB (double-crédit au replay admin). Le **thème n°2 est le funnel de paiement** : un bug Stripe `<Elements>` critique peut débiter l'ancien montant après modification du panier. Les thèmes secondaires (a11y, SEO, cohérence de contenu légal, dette de test) sont nombreux mais à faible sévérité individuelle. **Niveau de risque : élevé sur le money path et le checkout, modéré ailleurs.** L'essentiel des correctifs critiques est de petite taille (S/M) car les patterns corrects existent déjà ailleurs dans le code et ne sont que mal propagés.

---

## 2. Findings dédoublonnés

Plusieurs findings décrivent le **même défaut sous des dimensions différentes**. Regroupements appliqués :

- **WALLET-CANCEL** (apparaît 3×, dims payments/data-integrity/code-quality) : `/cancel` admin ne restaure pas le wallet.
- **TOPUP-IDEM** (apparaît 4×, dims payments/data-integrity/error-handling/testing) : `processWalletTopup` sans idempotence sur `paymentIntentId` → double-crédit au replay.
- **SINALITE-CANCEL-REFUND** (apparaît 2×, dims data-integrity/error-handling) : webhook Sinalite CANCELLED email « remboursé » sans refund Stripe.
- **FSM-SINALITE** (apparaît 2×, dims data-integrity/email) : `applySinaliteStatusChange` sans garde FSM → régression de statut + emails dupliqués.
- **REFERRAL-RESTORE** (apparaît 2×, dims payments/data-integrity) : crédit referral débité à la création, jamais restauré ni gardé.

Comptés une seule fois ci-dessous.

---

## 3. Rounds priorisés

### ROUND 1 — Argent client perdu / facturé à tort (CRITIQUE)

**1.1 — `<Elements>` Stripe sans `key={clientSecret}` : débit de l'ancien montant** · **critical**
- `src/app/order/review/page.tsx:517-535` (montage), recréation PI `243-314`
- *Pourquoi* : modifier le panier ou appliquer un promo recrée le PaymentIntent et met à jour le total affiché, mais `<Elements>` ignore le nouveau `clientSecret` (SDK Stripe le traite comme immuable). `confirmPayment()` confirme l'ancien intent → **client débité d'un montant ≠ montant affiché/consenti**. Impact financier + légal.
- *Fix* : ajouter `key={clientSecret}` sur `<Elements>` (force le remount), ou geler panier/promo tant que le PaymentElement est monté. **Effort S.**

**1.2 — Auto-refund webhook ne restaure pas le crédit wallet débité** · **critical**
- `src/lib/webhooks/stripe-process.ts:270-380` (refund `326`, débit wallet `270-279`)
- *Pourquoi* : sur échec Sinalite, le refund Stripe ne rend que `order.amountCents` (déjà net du wallet). Le wallet débité n'est jamais recrédité via `recordWalletTx`. C'est le bug Round 37 #1 corrigé dans `/admin/.../refund` mais **jamais porté sur le chemin le plus fréquent** (échec imprimeur auto). Perte client silencieuse, sans alerte.
- *Fix* : dans le catch Sinalite après refund OK, si `walletCreditAppliedCents > 0` → `recordWalletTx({ kind:'REFUND', ... })`, idempotent. **Effort S** (réutiliser le helper de `/refund`).

**1.3 — Webhook Sinalite CANCELLED : email « remboursé » sans aucun refund Stripe** · **critical**
- `src/lib/webhooks/sinalite-process.ts:95-101` ; `src/lib/db/orders.ts:399-423`
- *Pourquoi* : `applySinaliteStatusChange` ne fait qu'`update` le statut + email `refundAmountCents: order.amountCents`. Aucun `refunds.create`. Le client reçoit un courriel officiel annonçant un remboursement exact **jamais émis**. Risque chargeback + pratique commerciale trompeuse. Aucun cron ne réconcilie.
- *Fix* : sur transition CANCELLED Sinalite, émettre le refund Stripe (idempotencyKey dérivée du PI) + `markRefundIssued` + restauration wallet AVANT l'email ; si refund échoue, ne pas envoyer l'email et alerter. **Effort M.**

**1.4 — `/cancel` admin ne restaure jamais le crédit wallet (WALLET-CANCEL)** · **high**
- `src/app/api/admin/orders/[id]/cancel/route.ts:50-97` (cf. `refund/route.ts:181-214`)
- *Pourquoi* : `/cancel` est sémantiquement un full refund mais ne rembourse que la part Stripe. La route sœur `/refund` restaure le wallet (Round 37 #1), pas `/cancel`. L'email annonce `order.amountCents` (le total) → client croit être remboursé en entier, perd son wallet.
- *Fix* : extraire un helper `restoreWalletCreditOnFullRefund()` partagé entre `/refund` et `/cancel`. **Effort S.**

**1.5 — Email d'annulation annonce un remboursement inexistant sur commandes PENDING** · **high**
- `src/app/api/admin/orders/[id]/cancel/route.ts:53-97`
- *Pourquoi* : le refund n'est émis que `if status !== 'PENDING'`, mais `sendOrderCancelledEmail` est appelé inconditionnellement avec `refundAmountCents: order.amountCents`. Une commande PENDING (jamais débitée) génère un email « Remboursement : X $ ».
- *Fix* : `refundAmountCents: refund ? order.amountCents : 0` (cohérent avec l'audit qui met déjà `refundedCents:0`). **Effort S.**

---

### ROUND 2 — Double-crédit & idempotence webhook (CRITIQUE→HIGH)

**2.1 — `processWalletTopup` sans idempotence DB → double-crédit au replay (TOPUP-IDEM)** · **high**
- `src/lib/wallet/operations.ts:140-212` ; `prisma/schema.prisma:1308,1326` ; `src/app/api/admin/webhooks/[id]/replay/route.ts:64-68`
- *Pourquoi* : `WalletTransaction.paymentIntentId` est `@@index` mais **pas `@unique`** ; `processWalletTopup` ne vérifie aucune TOPUP existante. Le replay admin **bypasse le dedup WebhookEvent** → rejouer un `checkout.session.completed`/`invoice.paid` de topup crédite 2× (argent réel injecté). Le chemin order, lui, est protégé par le garde `status !== 'PENDING'`.
- *Fix* : `findFirst({ where:{ paymentIntentId, kind:'TOPUP' } })` → no-op si présent, dans la `$transaction` ; + contrainte `@@unique([paymentIntentId, kind])`. Ajouter un test verrouillant la dédup. **Effort M.**

**2.2 — Idempotence webhook trop agressive : un échec transitoire bloque le retry Stripe** · **high**
- `src/app/api/webhooks/stripe/route.ts:76-114` ; `src/lib/db/orders.ts:469-492`
- *Pourquoi* : `recordWebhookEvent` insère la row de dedup AVANT le traitement. Si le handler throw (overdraft wallet, blip DB, Sinalite+refund échouent), 500 → Stripe retry → mais le retry rejoue le create → P2002 → `isNew:false` → 200 `deduped` sans retraiter. **Le retry automatique Stripe est neutralisé** ; récupération seulement via dead-letter + replay manuel à 24h.
- *Fix* : record-after-process, ou status `PROCESSING`/`success` claim-based (n'activer la dédup que sur `success=true`), comme la queue email. **Effort M.**

**2.3 — Même mécanisme côté SES (suppression hard-bounce non complétée)** · **low**
- `src/app/api/webhooks/ses/route.ts:102-267`
- *Pourquoi* : si `suppressEmail` throw au milieu d'une notif multi-destinataires, le retry SNS est dédupé → on continue d'envoyer à un hard-bouncer. Filet : dead-letter manuel.
- *Fix* : même solution que 2.2 (claim-based). **Effort S** une fois 2.2 fait.

---

### ROUND 3 — Crédits referral & cohérence FSM Sinalite (HIGH→MEDIUM)

**3.1 — Crédit referral débité à la création, jamais restauré ni gardé (REFERRAL-RESTORE)** · **high**
- `src/app/api/orders/create/route.ts:376-392` ; absent de refund/cancel/stripe-process
- *Pourquoi* : `referralCreditCents: { decrement }` est appliqué dès la création du PI (avant paiement), sans garde de plancher (`gte`) ni reversal. Tout abandon/échec/refund/cancel → crédit perdu ; deux checkouts concurrents → balance négative (viole l'invariant schema).
- *Fix* : déplacer la déduction dans `markOrderPaidWithWalletDebit` (même `$transaction`, garde `gte`), + reversal dans `handlePaymentFailed`/refund/cancel. **Effort M.**

**3.2 — `applySinaliteStatusChange` ignore la FSM → régression de statut + emails dupliqués (FSM-SINALITE)** · **medium**
- `src/lib/db/orders.ts:399-423` ; `src/app/api/webhooks/sinalite/route.ts:109`
- *Pourquoi* : `order.update` brut sans `where status IN ALLOWED_PRIOR_STATUSES`, contredisant l'invariant Round 38 #4. Un webhook tardif/désordonné régresse le statut (DELIVERED→IN_PRODUCTION). De plus le fingerprint inclut `timestamp` → un re-push (ETA corrigée) re-déclenche l'envoi d'email (double review-request).
- *Fix* : router via `updateMany` gardé qui retourne `transitioned:boolean` ; n'envoyer l'email QUE si `transitioned===true`. **Effort M.**

**3.3 — Crédit wallet non réservé entre création et confirmation : double-dépense** · **medium**
- `src/app/api/orders/create/route.ts:313-323` ; débit à `stripe-process.ts:270`
- *Pourquoi* : aucun hold sur le wallet ; deux PI concurrents planifient le même solde. Le 2e débit throw → rollback → (combiné à 2.2) order coincée PENDING, client chargé sans commande.
- *Fix* : hold atomique à la création (restore sur échec/expiration), ou clamp `min(applied, soldeDispo)` au débit webhook au lieu de throw. **Effort M.**

**3.4 — Topup wallet : read-modify-write non verrouillé** · **medium**
- `src/lib/wallet/operations.ts:147-197`
- *Pourquoi* : `processWalletTopup` écrit une valeur absolue calculée sur une lecture non verrouillée (vs `recordWalletTx` qui utilise `increment` atomique). Topup + checkout concurrents → mouvement perdu, ledger incohérent.
- *Fix* : passer en `walletCents: { increment }` puis re-fetch pour le snapshot. **Effort S.** (Naturellement groupé avec 2.1.)

---

### ROUND 4 — Funnel de commande (HIGH→MEDIUM)

**4.1 — Retour Upload→Quantité duplique l'ID qty → lookup prix cassé, client bloqué** · **high**
- `src/app/order/upload/page.tsx:133` ; `src/components/wizard/QuantityClient.tsx:60-64,107`
- *Pourquoi* : `baseWithoutTurnaround` ne retire que le turnaround, pas le qty ; un nouveau qtyId est rajouté → clé `4-30-78-78-107` absente de l'index → `lookupVariant` null → tous les prix affichent « — », bouton Continuer désactivé. **Aller-retour banal = funnel bloqué.**
- *Fix* : filtrer aussi les IDs du groupe qty dans `QuantityClient` ; dédup par groupe côté serveur en sécurité. **Effort S.**

**4.2 — Reprise panier abandonné : devis livraison non signé (sig absent du resumeQuery)** · **medium**
- `src/app/order/shipping/page.tsx:387-395` ; `cron/abandoned-cart/route.ts:121`
- *Pourquoi* : le `resumeQuery` omet `sig` (présent dans `nextHref`). Tout checkout recovery journalise « devis non signé », **bloquant le flip log-only → reject 409** noté en mémoire.
- *Fix* : ajouter `sig: selectedSig` dans le ship du `resumeQuery`. **Effort S.**

**4.3 — Bouton « Précédent » shipping→upload perd les fichiers uploadés** · **medium**
- `src/app/order/shipping/page.tsx:168`
- *Pourquoi* : `prevHref` omet `&files=`, et `UploadPageInner` ne réhydrate pas depuis `files` → dropzone vide, re-upload forcé. Friction juste avant paiement.
- *Fix* : porter `&files=...` dans `prevHref` + réhydrater l'état recto/verso depuis le param. **Effort S.**

---

### ROUND 5 — Idempotence admin & intégrité données (HIGH→MEDIUM)

**5.1 — Collision de clé d'idempotence : deux refunds partiels identiques = un seul refund Stripe** · **high**
- `src/app/api/admin/orders/[id]/refund/route.ts:105-131`
- *Pourquoi* : la clé = hash de `{orderId, amountCents, adminUserId}`. Deux refunds partiels distincts de même montant par le même admin (~24h) → Stripe renvoie le 1er en cache, mais le code notifie/journalise/décrémente comme si un 2e avait réussi. **Client lésé silencieusement.**
- *Fix* : ajouter un nonce/timestamp court ou `alreadyRefundedCents` à la clé. **Effort S.**

**5.2 — TOCTOU + drift sur `PromoCode.usesCount`** · **medium**
- `src/lib/promo/validate.ts:87` ; `src/lib/db/orders.ts:141-150`
- *Pourquoi* : increment sans garde `WHERE usesCount < maxUses` (over-redemption concurrent) ; incrément à la création PENDING jamais décrémenté → drift, codes épuisés prématurément (clients refusés).
- *Fix* : déplacer/conditionner l'increment au passage PAID avec `updateMany` gardé. **Effort M.**

**5.3 — Lien cross-user DesignDraft sans ownership dans orders/create** · **low**
- `src/app/api/orders/create/route.ts:458-470`
- *Pourquoi* : `update({ where:{ id } })` sans `userId` → rattacher le draft d'autrui. Pollution analytics (id à haute entropie, faible impact).
- *Fix* : `updateMany({ where:{ id, userId, orderId:null } })` comme `designs/finalize`. **Effort S.**

**5.4 — Taxe potentiellement négative (promo 100% + reseller)** · **low**
- `src/app/api/orders/create/route.ts:295-307`
- *Fix* : `Math.max(0, taxableSubtotal)` avant `computeTax`. **Effort S.**

---

### ROUND 6 — Sécurité endpoints publics (HIGH→MEDIUM)

**6.1 — Open redirect non authentifié dans `/api/recovery/click`** · **high**
- `src/app/api/recovery/click/route.ts:37-49`
- *Pourquoi* : `decoded.startsWith(APP_URL)` accepte `https://plio.ca.evil.com/phish` (check de préfixe sans frontière), atteignable sans token. Lien d'apparence légitime → phishing.
- *Fix* : `new URL(decoded, APP_URL)` puis comparer `origin`, ou n'autoriser que les chemins relatifs (`/` mais pas `//`). **Effort S.**

**6.2 — `/api/products/[id]/variants` expose les prix de gros bruts Sinalite** · **medium**
- `src/app/api/products/[id]/variants/route.ts:24-44` (aussi `.../price`)
- *Fix* : appliquer le markup via `getEnrichedVariantIndex`, ou supprimer/auth+rate-limit la route si legacy. **Effort S.**

**6.3 — `/api/designs/finalize` : rendu PDF + écriture DB sans auth ni rate-limit** · **medium**
- `src/app/api/designs/finalize/route.ts:32-88`
- *Fix* : `rateLimit('render', clientIp(req))` en tête (comme `/render`), + plafond de drafts guest/IP. **Effort S.**

**6.4 — `/api/shipping/estimate` : public, non rate-limité, proxy vers Sinalite payante** · **medium**
- `src/app/api/shipping/estimate/route.ts:20-50`
- *Fix* : `rateLimit` + borner `items` à `.max(20)`. **Effort S.**

**6.5 — `/api/abandoned-cart` : enrôlement d'emails tiers non sollicités (CASL)** · **medium**
- `src/app/api/abandoned-cart/route.ts:36-64`
- *Fix* : lier la capture à un cookie de session signé, ou n'envoyer qu'aux emails avec compte/commande ; rate-limit par email. **Effort M.**

**6.6 — `withErrorHandler` renvoie `err.message` brut + body Sinalite au client** · **medium**
- `src/lib/api-helpers.ts:30-47`
- *Fix* : message générique en prod (log côté serveur uniquement) ; retirer `endpoint/body` Sinalite de la réponse. **Effort S.**

**6.7 — Comparaisons HMAC non constant-time (review/newsletter)** · **low**
- `src/app/api/reviews/submit/route.ts:37` ; `src/app/api/newsletter/unsubscribe/route.ts:34,86`
- *Fix* : factoriser `timingSafeStringEqual` (existe dans `sinalite-signature.ts`). **Effort S.**

**6.8 — `GET /api/orders?limit` sans cap** · **low**
- `src/app/api/orders/route.ts:16-18` — clamp `.max(100)`. **Effort S.**

---

### ROUND 7 — Emails & crons (HIGH→MEDIUM)

**7.1 — `reseller-monthly-stats` : dédup par label fictive → emails dupliqués au re-run** · **high**
- `src/app/api/cron/reseller-monthly-stats/route.ts:185-189` ; `queue.ts:208-223`
- *Pourquoi* : `queueEmail` ne consulte jamais le label ; pas de pré-check `findFirst` (contrairement à `re-engagement`). Re-run GH Actions/retry → chaque reseller B2B reçoit 2× le récap. Docstring trompeur.
- *Fix* : pré-check `findFirst({ where:{ label } })` avant envoi ; idéalement `label @unique` + create idempotent dans `queueEmail`. **Effort S.**

**7.2 — `re-engagement` winback : PromoCode orphelin créé à chaque run pour opt-out** · **medium**
- `src/app/api/cron/re-engagement/route.ts:153-194`
- *Pourquoi* : le PromoCode est créé AVANT l'envoi ; si `emailReengagement=false`, early-return → aucune EmailDelivery → pas de marqueur → recréation quotidienne de codes actifs jamais livrés (bloat + codes valides orphelins).
- *Fix* : créer le code APRÈS `result.sent===true`, ou filtrer les opt-out à la sélection. **Effort S.**

**7.3 — `cron/broadcasts` : claim non borné vs dispatch `take:10` → overflow coincé en PROCESSING** · **medium**
- `src/app/api/cron/broadcasts/route.ts:45-65,80-84`
- *Pourquoi* : claim flippe TOUS les SCHEDULED, dispatch n'en traite que 10 ; le surplus reste PROCESSING, jamais re-claimé si plus aucun SCHEDULED dû. Un broadcast (10k+ destinataires) silencieusement non envoyé. Aucun reaper.
- *Fix* : borner le claim aux IDs sélectionnés (`findMany take:10` + `updateMany WHERE id IN`) ; reaper PROCESSING→SCHEDULED après X min. **Effort M.**

**7.4 — Lien désabonnement cassé pour invités abandoned-cart (CASL)** · **medium**
- `src/lib/emails/send.ts:510-529` ; `email-preferences/page.tsx:53-55`
- *Pourquoi* : `UNSUBSCRIBE_URL` pointe vers une page auth-gated → un invité sans compte ne peut pas se désabonner.
- *Fix* : pointer vers `/api/newsletter/unsubscribe?email=&token=` (HMAC, déjà existant). **Effort S.**

**7.5 — Bouton « Suivre le colis » mort quand SHIPPED arrive sans tracking** · **medium**
- `src/lib/emails/templates/email-order-shipped.html:65` ; `send.ts:262-272`
- *Fix* : masquer le bouton si `TRACK_URL` vide, ou fallback `ORDER_URL`. **Effort S.**

**7.6 — Webhook Sinalite : email dupliqué sur re-push (timestamp différent)** · **medium**
- *Couvert par 3.2* (même fix `transitioned`).

**7.7 — List-Unsubscribe GET ne désabonne pas `User.emailMarketing`** · **low**
- `src/app/api/newsletter/unsubscribe/route.ts:22-68` — dupliquer la logique POST dans le GET. **Effort S.**

**7.8 — Welcome email sans verrou dédup ; pixel d'ouverture sur transactionnels ; auth cron dupliquée inline ; daily-summary sans dédup** · **low**
- `auth.ts:176-200` ; `queue.ts:297`/`render.ts:127-137` ; `cron/*/route.ts` ; `cron/daily-summary/route.ts:206-214`
- *Fix groupé* : colonne `welcomeEmailSentAt` ou dédup label ; restreindre le pixel aux `MARKETING_TEMPLATES` + aligner doc ; extraire `requireCronAuth()` (timingSafeEqual) ; pré-check label daily-summary. **Effort S chacun.**

---

### ROUND 8 — Cohérence contenu légal & marketing (HIGH→LOW)

**8.1 — Politique de confidentialité nomme « Vercel (USA) » comme hébergeur (réel : AWS Amplify)** · **high**
- `src/app/legal/privacy/page.tsx:142-144,179`
- *Pourquoi* : document légal Loi 25 art. 17 factuellement faux sur l'hébergeur et la localisation des données ; le DPA invoqué ne couvre pas le vrai fournisseur.
- *Fix* : remplacer par « AWS Amplify Hosting » + région réelle ; vérifier la région Neon. **Effort S.**

**8.2 — « Sinalite (USA) » contredit « imprimeur Ontario » + « 100 % imprimé au Canada »** · **high**
- `privacy:157-159` vs `terms:53` vs `about:72-73,94` ; `pricing:298`
- *Pourquoi* : même sous-traitant étiqueté USA (privacy) et Ontario/canadien (terms/about), désaligné avec l'argument de vente central. Risque publicité trompeuse + transfert PII mal déclaré.
- *Fix* : établir le pays réel (Sinalite = Markham ON) et uniformiser → corriger « Sinalite (USA) ». **Effort S.**

**8.3 — Fausse promesse « 25 $ offerts sur ta 1re commande » — aucun crédit accordé** · **high**
- `src/app/sign-up/page.tsx:41-46,33`
- *Pourquoi* : `events.signIn` ne crée aucun crédit/code ; nouvel inscrit ne reçoit rien. Risque LPC QC / Bureau de la concurrence.
- *Fix* : soit implémenter le crédit (WalletTransaction welcome / code unique), soit retirer la promesse. **Effort S** (retrait) **/ M** (implémentation).

**8.4 — Refund-policy promet « annulation 1 clic, refund instantané » — runtime = demande manuelle 1-2h** · **medium**
- `refund-policy/page.tsx:62` vs `CancelRequestButton.tsx`
- *Fix* : aligner la copie sur le vrai flux. **Effort S.**

**8.5 — Confidentialité : « Presigned URLs expirent 7 jours » — bucket en réalité public-read permanent** · **medium**
- `privacy:149` vs `s3.ts:130-147`
- *Fix* : corriger le texte (URL non devinable, pas d'expiration) ou implémenter le presigned GET. **Effort S** (texte).

**8.6 — Fausse feature « génération de logo IA / photos stock »** · **medium**
- `page.tsx:249` ; `sign-up:45,67` — retirer les mentions. **Effort S.**

**8.7 — Divers contenu** · **low** : SES déclaré USA vs ca-central-1 (`privacy:152`) ; claim « 15-30 % moins cher que Vistaprint » non sourcé (`pricing:298`) ; prix home incohérents vs `/pricing` ; carte design-system 14pt vs 16pt (`design-system:491`) ; moyenne étoiles sur 5 reviews (`ReviewsWidget.tsx:62-68`). *Fix éditorial groupé.* **Effort S.**

---

### ROUND 9 — Accessibilité (MEDIUM→LOW)

**9.1 — `useConfirmDialog` sans focus-trap ni Escape (18 consommateurs, dont suppression compte/adresse)** · **medium**
- `src/hooks/useConfirmDialog.tsx:67-150` — `useFocusTrap` + listener Escape + restore focus. **Effort S.**

**9.2 — Erreurs de formulaires non annoncées (`role="alert"`/`aria-live` manquant) — systémique** · **medium**
- 6 fichiers (contact, tracking, newsletter, review, design, upload) — factoriser `<FormError role="alert">`. **Effort S.**

**9.3 — Combobox `AddressAutocomplete` du checkout sans nom accessible** · **medium**
- `AddressAutocomplete.tsx:159-174` — prop `aria-label="Adresse"`. **Effort S.**

**9.4 — Modals divers sans focus-trap/Escape/nom + état radio non exposé** · **low**
- `AddressForm`, `ShippingEditButton`, `NpsAutoPrompt`, méthodes de livraison (`shipping:491-540`), `UserMenu` role=menu invalide, favoris title-only. *Fix groupé : `useFocusTrap` + Escape + `aria-pressed`/`aria-label`.* **Effort S chacun.**

---

### ROUND 10 — Performance, dette de test & qualité (HIGH→LOW)

**10.1 — Landing page forcée dynamique par `cookies()` → cache reviews annulé, 4-5 requêtes DB/visite** · **high**
- `page.tsx:20` ; `TestimonialsSection.tsx:13` ; `ReviewsWidget.tsx:32`
- *Fix* : `unstable_cache(..., { revalidate:600, tags:['reviews'] })` + `revalidateTag` côté admin ; ou résoudre la locale plus bas dans l'arbre. **Effort M.**

**10.2 — Le middleware (seule barrière `/admin/*`) n'a aucun test** · **medium**
- `src/middleware.ts:36-111` — tester redirections admin/auth + dérivation `token.role`. **Effort S.**

**10.3 — Money path non testé : PRICE_MISMATCH, cap 50¢, snapshot wallet, topup idempotence, paths wallet du webhook** · **medium**
- `orders-create.test.ts`, `wallet-process-topup-atomic.test.ts`, `webhooks-stripe.test.ts` — ajouter les cas manquants. **Effort M.** (À coupler avec les fix Round 1-2.)

**10.4 — Webhook Sinalite : gardes 503 prod / rejet replay timestamp non testées** · **medium**
- `webhooks-sinalite.test.ts` — tester 503 secret absent + 400 stale/future. **Effort S.**

**10.5 — Perf admin/crons** · **medium→low** : `/admin/finances/products` findMany sans `take` (`78-90`) ; `/admin/users` groupBy global (`79-85`) ; requêtes sidebar redondantes en waterfall ; N+1 re-engagement ; reseller-detection updates un-par-un. *Fix : `take` de sécurité, `groupBy` borné aux IDs de page, fusionner counts, `findMany`/`updateMany` batchés.* **Effort S-M.**

**10.6 — Dashboard finances : refunds partiels comptés comme complets (revenu net faux)** · **medium**
- `finances/page.tsx:201-203` ; `orders.ts:375-386` — stocker `amountCents` dans `OrderEvent.data` au `markRefundIssued`. **Effort S.**

**10.7 — Audit log pollué** · **medium→low** : demandes client `cancel-request` loggées en `ADMIN_MANUAL_CANCEL` avec email client (`cancel-request/route.ts:149-161`) ; kinds génériques `ADMIN_TEMPLATE_EDIT`/`ADMIN_RESEND_EMAIL` réutilisés ; `/cancel` journalise le total même après refund partiel. *Fix : kinds dédiés + montant réel `refund.amount`.* **Effort S.**

**10.8 — Dette qualité diverse** · **low** : identité fiscale TPS/TVQ dupliquée dans 3 fichiers (centraliser `getCompanyIdentity()`) ; `slow-query-log` lit `process.env` hors schéma ; casts `as never` AdminSidebar ; `saved-configs/import` tags non normalisés ; `PATCH .../shipping` hors `withErrorHandler`. **Effort S.**

**10.9 — SEO/structured-data** · **medium→low** : titres dupliqués « … · Plio · Plio » (`layout.tsx:26` + pages) ; favicon/logo absents (`layout.tsx:79`, `blog/[slug]:69`) ; Product JSON-LD sur page robots-disallow ; RSS non découvrable ; hreflang identiques ; ItemList vers URLs disallow ; fallback www/non-www divergent. *Fix : `title.absolute` ou retrait suffixe ; ajouter assets ; centraliser `APP_URL`.* **Effort S chacun.**

---

## 4. Points forts (calibrage)

Le codebase montre une **vraie maturité de durcissement** :
- **FSM optimiste appliquée** sur `markOrderSubmitted`/`markOrderFailed`/`markOrderPaid` (`updateMany WHERE status IN ALLOWED_PRIOR_STATUSES`) — l'invariant existe, il faut juste l'étendre à `applySinaliteStatusChange`.
- **Débit wallet atomique** avec garde `WHERE walletCents >= amount` (`recordWalletTx`, Round 38 #3) ; `markOrderPaidWithWalletDebit` correctement transactionnel.
- **Dédup webhook** via `@@unique([source, eventId])` ; dead-letter + alerte Slack + replay admin en filet.
- **HMAC constant-time** déjà en place sur les tokens à enjeu (recovery click-token, shipping quote, sinalite-signature, retry-token) — seuls 2 tokens à faible enjeu dérogent.
- **Garde anti-tampering** server-side du prix (`PRICE_MISMATCH 409`) + cap wallet/referral à 50¢ + idempotencyKey Stripe sur la création de PI.
- **Auth admin** centralisée (`requireAdmin`/`requireAdminPage`), middleware edge avec role check, anti-substring `isAdminEmail` testé.
- **Suppression list** SES, cap CASL `DAILY_EMAIL_CAP`, lien unsub dans le body, OG images dynamiques, schémas Zod sur les payloads externes.
- **Conscience de la dette** : nombreux commentaires « Round XX #Y » documentant les fixes et les tradeoffs assumés (B1 différé, etc.).

Le profil est celui d'une app **bien structurée dont les défauts résiduels sont des oublis de propagation** (un pattern correct existe mais n'a pas été appliqué partout), pas des erreurs de conception.

---

## 5. Top 5 actions à plus haut ROI

1. **`key={clientSecret}` sur `<Elements>`** (`order/review/page.tsx:517`) — *effort S, sévérité critical.* Empêche de débiter le client du mauvais montant. Plus haut ratio impact/effort de tout l'audit.
2. **Helper partagé `restoreWalletCreditOnFullRefund()`** appelé dans auto-refund webhook (1.2), `/cancel` (1.4) et Sinalite CANCELLED (1.3) — *effort M, résout 3 bugs critical/high d'argent perdu d'un coup* en réutilisant le code Round 37 déjà éprouvé.
3. **Idempotence `processWalletTopup`** : `@@unique([paymentIntentId, kind])` + no-op `findFirst` + passage en `increment` (2.1 + 3.4) — *effort M, sévérité high.* Ferme le double-crédit au replay admin ET le lost-update concurrent, avec un test verrouillant l'invariant.
4. **Fix dédup webhook record-after-process** (`webhooks/stripe/route.ts:76`, 2.2) — *effort M, sévérité high.* Restaure le retry automatique Stripe ; débloque les commandes coincées PENDING (client chargé sans commande), bug à fort impact support.
5. **Corriger les 3 mensonges légaux/marketing** : Vercel→Amplify (8.1), Sinalite USA→ON (8.2), retirer/implémenter « 25 $ offerts » (8.3) — *effort S total, 3× high.* Risque Loi 25 / Bureau de la concurrence, correctif purement éditorial, aucun risque de régression code.
