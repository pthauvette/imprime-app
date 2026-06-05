# Audit multiagent v3 — Plio (imprime-app)

Date : 2026-06-05
Périmètre : changements récents de la session (produits virtuels + collapse page produit, devis shipping signé full-cart + enforce, opt-in marketing affirmatif, rectification profil, clé S3, redaction PII logs) + revue transversale sécurité / correctness / money / privacy / data / tests.
Méthode : audit multiagent par dimension, puis vérification adversariale de chaque finding contre le vrai code (file:line). Seuls les findings confirmés sont retenus. Dédupliqués et reclassés ci-dessous.

---

## Résumé exécutif

**Verdict global : sain, mais 2 trous financiers réels à fermer avant le flip prod.**

Le code est globalement solide et défensif : recompute serveur du prix anti-tampering, idempotency Stripe, devis de livraison signé HMAC, redaction PII centralisée, suppression PIPEDA structurée, opt-in marketing affirmatif conforme Loi 25. Aucun finding **critical**. Aucune fuite d'argent massive non gardée. La plupart des défauts sont des angles morts ciblés autour de features récentes (devis full-cart, crédits wallet/referral, suppression PIPEDA) et des trous de couverture de test.

Les **deux priorités réelles** sont : (1) le bypass du devis de livraison via `shippingPrice=0` qui survit au durcissement planifié `ENFORCE_SHIPPING_SIG`, et (2) la fuite PII en clair dans `Order.sinalitePayload` après une suppression PIPEDA (contredit le courriel de confirmation envoyé au client). Les deux double-dips de crédit (wallet + referral) sont reproductibles intentionnellement mais plafonnés en perte unitaire au solde du compte.

**Compte par sévérité (après dédup) :**

| Sévérité | Nombre |
|----------|--------|
| Critical | 0 |
| High     | 3 |
| Medium   | 5 |
| Low      | 5 |
| **Total** | **13** |

Findings d'origine : 16. Fusions : wallet + referral double-dip (pattern identique) restent 2 entrées car fix par crédit distinct, mais traités ensemble ; reset d'état review (PaymentIntent périmé + erreur périmée) fusionnés en 1 ; reste inchangé.

---

## Findings (par sévérité puis impact)

### HIGH

---

#### H1 — Order.sinalitePayload conserve nom/courriel/adresse/téléphone EN CLAIR après une suppression PIPEDA
- **Sévérité :** high
- **Dimension :** privacy
- **Fichier :** `src/app/api/admin/users/[id]/delete-pipeda/route.ts:104-162`

**Description.** La suppression PIPEDA anonymise les colonnes `Order.shipName/shipLine1/shipCity/shipPostalCode/shipPhone` (lignes 104-114) mais ne touche **jamais** `Order.sinalitePayload`. Ce champ (`prisma/schema.prisma:223`, persisté via `JSON.stringify` dans `src/lib/db/orders.ts:116`) est le snapshot complet du payload Sinalite (`buildSinalitePayload`, `src/app/api/orders/create/route.ts:622-646`) et contient en clair : `ShipFName, ShipLName, ShipEmail, ShipAddr, ShipAddr2, ShipCity, ShipZip, ShipPhone, BillEmail, BillPhone`. Les Orders sont volontairement conservées (rétention fiscale LIR 6 ans) → ces lignes survivent avec le PII intact. Le commentaire « Round 39 #1 » prétend boucher exactement ce trou pour les colonnes `ship*` mais oublie `sinalitePayload`. Le code sait pourtant que ce champ porte du PII : `data-export` l'omet explicitement (`src/app/api/account/data-export/route.ts:168`).

**Impact.** Violation directe du droit à l'effacement (Loi 25 art. 28.1 / PIPEDA). Le courriel de confirmation au client (route lignes ~262) affirme « Adresse email, nom, téléphone, adresses → supprimés » — factuellement faux. PII toujours lisible via `/admin/orders/[id]/replay-sinalite` (`JSON.parse(order.sinalitePayload)`) et le reorder deep-link (`src/app/order/start/page.tsx:56`). Un audit CAI relèverait la contradiction immédiatement.

**Fix.** Dans la transaction `delete-pipeda`, ré-écrire `sinalitePayload` de chaque Order du user : parser le JSON, remplacer `shippingInfo.ShipFName/ShipLName/ShipEmail/ShipAddr/ShipAddr2/ShipCity/ShipZip/ShipPhone` et `billingInfo.Bill*` par les sentinelles déjà définies (`[PIPEDA-DELETED]`, `anonymizedEmail`, `A0A 0A0`, `+10000000000`), puis re-stringify. Conserver les items/options (non identifiants) pour l'audit fiscal. Lecture + ré-écriture par order, ou raw update JSONB.

---

#### H2 — Re-create du PaymentIntent qui échoue laisse l'ancien clientSecret/breakdown actifs → paiement de l'ancien panier
- **Sévérité :** high
- **Dimension :** correctness
- **Fichier :** `src/app/order/review/page.tsx:252-359` (fusionne aussi l'erreur périmée jamais nettoyée, même cause racine)

**Description.** L'effet de création du PaymentIntent re-tourne à chaque mutation du panier (dep `allItemsKey` — bouton « Retirer » ligne 416) et à chaque promo. Mais au début d'un re-run il ne remet **jamais** à zéro `clientSecret`, `breakdown`, `error` ni `loading`. Les setters de succès (`setClientSecret`/`setBreakdown`, lignes 350-351) ne s'exécutent qu'en cas de succès ; en cas d'échec le catch ne fait que `setError` (ligne 354). Or le formulaire de paiement est rendu dès que `clientSecret && breakdown && stripe` (ligne 566). Conséquence : un premier create réussit (formulaire payable), l'utilisateur retire un article, le **nouveau** create échoue (ré-estimation shipping full-cart `throw` ligne 300, ou méthode disparue `throw` ligne 307) → l'ancien `clientSecret`/`breakdown` restent montés → le bouton « Confirmer X $ » débite l'**ancien** PaymentIntent (ancien panier, ancien montant), pendant qu'un message d'erreur s'affiche en parallèle. Corollaire : `error` n'étant jamais remis à `null`, un ancien bandeau rouge coexiste avec un formulaire redevenu valide (confusion UX au point de paiement, abandon de checkout pourtant bon).

**Impact.** Le client peut payer un montant qui ne correspond plus à son panier (ancien total, ancien set d'items, ancienne livraison). Incohérence financière directe + commande PENDING serveur divergente. Le fix `key={clientSecret}` existant ne couvre que le re-create **réussi**, pas l'échec.

**Fix.** Au tout début de l'IIFE de l'effet (après le guard ligne 257), réinitialiser l'état : `setLoading(true); setError(null); setClientSecret(null); setBreakdown(null);` (en respectant le flag `cancelled` comme ailleurs). Un re-run masque alors le formulaire tant qu'un nouveau `clientSecret`/`breakdown` valide n'est pas obtenu, et un échec ne laisse jamais un intent périmé payable. Ce seul correctif ferme aussi le bandeau d'erreur périmé.

---

#### H3 — Champ dénormalisé User.name jamais recalculé hors du flux profil → ré-évalué à low
> Note : finding d'origine classé low. Listé ici par proximité avec D1 (même bloc de code). **Sévérité réelle : low** — voir section LOW (L5). Conservé là-bas pour ne pas surclasser un défaut cosmétique.

---

### MEDIUM

---

#### M1 — Bypass de la signature du devis de livraison via shippingPrice=0 (sous-facturation de la livraison)
- **Sévérité :** medium (impact financier, survit au durcissement prévu)
- **Dimension :** sécurité
- **Fichier :** `src/app/api/orders/create/route.ts:291`

**Description.** La vérification HMAC du devis de livraison n'est exécutée que dans la branche `if (payload.shippingPrice > 0)` (ligne 291). Un client qui POST `shippingPrice: 0` (valide vis-à-vis du schéma `z.number().nonnegative()`, ligne 78) saute **entièrement** `verifyShippingQuoteToken`, le warning log ET le reject 409, sans fournir de `shippingQuoteSig`. Le serveur ne re-fetch jamais le vrai coût Sinalite dans ce chemin : `applyShippingPerks` retourne `effectiveShippingPrice = input.shippingPrice = 0` pour tout tier non-GOLD. Ce 0 alimente le subtotal taxable puis le PaymentIntent Stripe → livraison facturée 0 $ au client. **Ce contournement survit à l'activation de `ENFORCE_SHIPPING_SIG=1`** puisque l'enforcement vit À L'INTÉRIEUR de la branche `> 0`. Chemin non atteignable légitimement : le flux review poste toujours un `price > 0` signé ; le seul shipping=0 légitime est le perk GOLD, calculé 100 % server-side.

**Impact.** Un acheteur malveillant commande n'importe quel produit en payant 0 $ de livraison (+ taxe correspondante) via un POST direct `shippingPrice: 0`. Stripe encaisse le montant réduit, Sinalite facture ensuite Plio le vrai coût d'expédition (UPS/FedEx réel) → perte de marge directe à chaque commande, **non loggée** (le warning est aussi dans la branche `> 0`).

**Fix.** Sortir la vérification de la branche `> 0`. Quand `ENFORCE_SHIPPING_SIG` est actif, exiger une signature valide dès que `shippingPrice >= 0` (ou traiter `0` comme suspect : rejet si `0` sans sig couvrant un `0` légitime calculé server-side). Idéalement, ne jamais faire confiance au prix de livraison client : toujours re-vérifier la sig (y compris pour 0) ou re-fetch l'estimation Sinalite. Logger le warning aussi pour `shippingPrice=0`.

---

#### M2 — Double-dip du crédit wallet via checkouts concurrents
- **Sévérité :** medium
- **Dimension :** money
- **Fichier :** `src/app/api/orders/create/route.ts:375-385` + `src/lib/db/orders.ts:224-301`

**Description.** Au create, le crédit wallet est calculé à partir de `userWalletCents` lu en DB **sans lock ni décrément** (route.ts:271-279) ; le débit réel n'a lieu qu'au webhook `payment_intent.succeeded` (`markOrderPaidWithWalletDebit`). Entre create et paiement, le solde n'est jamais réservé. Un user avec wallet=50 $ lance deux checkouts en parallèle : chaque create lit 50 $, applique −50 $ sur les deux totaux Stripe, persiste `walletCreditAppliedCents=5000` sur A et B. Au paiement, le webhook A débite 50 $→0, puis B tombe sur le guard `walletCents gte 5000` qui échoue → au lieu de rejeter, le code **clamp** le débit au disponible (0 $) et complète quand même l'order (`orders.ts:252-282`, warn + alerte Slack post-commit). Le même 50 $ a réduit le montant Stripe de **deux** commandes.

**Impact.** Perte d'argent directe et reproductible : le client paie strictement moins en cash que la valeur livrée. Détecté a posteriori (`walletShortfallCents`) mais jamais empêché — le PaymentIntent est déjà capturé.

**Fix.** Réserver le solde wallet à la création du PaymentIntent (décrément atomique gardé `gte` au moment du create, restauration sur abandon/échec/refund — symétrique au refund existant). À défaut, sérialiser les checkouts par `userId` via verrou pessimiste `SELECT … FOR UPDATE` sur la row User (pattern déjà utilisé par `processWalletTopup`, `operations.ts:247`). À défaut encore, relire le solde réel au débit webhook et plafonner le crédit appliqué, en re-capturant la différence Stripe.

---

#### M3 — Double-dip identique sur le crédit referral concurrent
- **Sévérité :** medium
- **Dimension :** money
- **Fichier :** `src/app/api/orders/create/route.ts:380-384` + `src/lib/db/orders.ts:307-341`

**Description.** Même schéma que M2 : `referralCreditApplied` calculé au create depuis `userReferralCreditCents` lu en DB (route.ts:277), persisté sur l'Order, débité seulement au webhook. Deux checkouts concurrents lisent le même solde, appliquent chacun la totalité du crédit, et au paiement le second débit tombe sur le guard `referralCreditCents gte …` qui, en cas d'échec, **clamp** au disponible et complète l'order quand même (`orders.ts:315-340`). Le code lui-même note « Même pattern que le crédit referral (#3.1) ».

**Impact.** Le crédit de parrainage (`REFERRAL_REWARD_CENTS`) dépensé plus d'une fois → perte de marge marketing réelle, déclenchable intentionnellement.

**Fix.** Identique à M2 appliqué au crédit referral : réservation/décrément atomique gardé (`gte`) à la création du PaymentIntent avec restauration sur abandon/échec (le `restoreReferralCreditOnFullRefund` existe déjà sur refund), ou plafonnement relu au débit webhook. **Recommandé : un seul correctif de sérialisation par `userId`** couvrant wallet + referral simultanément.

---

#### M4 — orders/create écrase le profil (firstName/lastName/phone) du user authentifié avec le contact de livraison
- **Sévérité :** medium
- **Dimension :** data
- **Fichier :** `src/app/api/orders/create/route.ts:446-463`

**Description.** Quand l'utilisateur est connecté, le handler exécute **inconditionnellement** `prisma.user.update({ where:{ id }, data:{ firstName: payload.contact.firstName, lastName: payload.contact.lastName, phone: payload.contact.phone } })` à chaque commande. Or `payload.contact` est le contact de **livraison** (le commentaire ligne 444-446 reconnaît même que le user « a peut-être tapé un email contact différent »). Le formulaire de checkout (`src/app/order/shipping/page.tsx:63-89`) initialise ces champs vides puis les hydrate depuis localStorage, jamais depuis le profil du compte → ils ne sont pas liés à l'identité du compte. Un reseller (ou quiconque commande pour un tiers) voit son propre profil réécrit par le dernier destinataire saisi.

**Impact.** Corruption silencieuse de l'identité du compte. Pour un reseller, le profil dérive vers le dernier client servi. Impacts : factures/PDF (`invoice-pdf`, `timeline-pdf` utilisent `user.name`), emails, affichage admin, « Bonjour <prénom> » — mauvaise identité, sans trace d'audit. Heurte l'intégrité des renseignements personnels (Loi 25), juste après le commit #314 « rectification self-serve du profil ».

**Fix.** Ne pas écraser l'identité du compte authentifié. Préféré (b) : ne rien écrire sur le User connecté — nom/téléphone vivent déjà sur `Order.shipName/shipPhone` et dans `sinalitePayload`. À défaut (a) : ne patcher `firstName/lastName/phone` que s'ils sont vides côté User (comme `findOrCreateUserByEmail`).

---

#### M5 — Logger : le champ `to` (courriel destinataire) n'est pas censuré → fuite PII en clair dans CloudWatch
- **Sévérité :** medium
- **Dimension :** privacy
- **Fichier :** `src/lib/logger.ts:38-53`

**Description.** `REDACT_PATHS` ne censure que `email/*.email` et `phone/*.phone`. Le champ `to` (courriel client) n'y figure pas. Plusieurs logs émettent l'email destinataire sous la clé `to` : `src/lib/emails/queue.ts:178,184,194,200,221` (et aussi `:332,:345`, chemins send/retry) — déclenchés sur **tous** les envois (suppression check, throttle check, fallback insert) → tous les courriels transactionnels et marketing ; `src/app/api/admin/messages/[id]/route.ts:95` et `src/app/api/admin/quotes/[id]/route.ts:77` (`to: existing.email`, courriel du client). Le commentaire du logger (lignes 30-35) prétend couvrir centralement tout log de courriel — couverture incomplète car elle suppose que la clé s'appelle `email`.

**Impact.** Courriels clients en clair dans CloudWatch (logs centralisés, queryables, conservés, partagés) → collecte non minimisée de renseignements personnels (Loi 25 / LPRPDE). Volume élevé.

**Fix.** Ajouter `'to', '*.to', 'recipient', '*.recipient'` à `REDACT_PATHS`. Garder `adminEmail` non censuré (personnel, voulu). **Ne pas** censurer `EmailDelivery.to` en base — seule la sortie logger est concernée. Étendre `tests/logger-redaction.test.ts` pour couvrir `{ to }`.

---

#### M6 — L'enforce du devis signé (ENFORCE_SHIPPING_SIG) n'a aucun test d'intégration — alors qu'on s'apprête à l'activer en prod
- **Sévérité :** medium
- **Dimension :** tests
- **Fichier :** `src/app/api/orders/create/route.ts:291-335` (test manquant dans `tests/orders-create.test.ts`)

**Description.** Le helper `verifyShippingQuoteToken` est testé en isolation, mais son **intégration** dans `/api/orders/create` ne l'est pas. Aucun test ne couvre : sig absente/invalide + `ENFORCE_SHIPPING_SIG=1` → 409 ; sig valide → 200 ; log-only (var absente) → passe ; `shippingPrice=0` → skip. `tests/orders-create.test.ts` envoie `shippingPrice:20` **sans** `shippingQuoteSig` partout et ne passe que parce que `ENFORCE_SHIPPING_SIG` n'est pas set dans l'env de test (`tests/setup.ts`).

**Impact.** C'est la feature notée « reste à ACTIVER en prod ». Au flip, soit (1) un bug de plomberie de la canonical (province vs ShipState, postal non normalisé, ordre des productIds) rejette TOUS les checkouts en 409 → arrêt des ventes ; soit (2) la garde ne déclenche pas et la sous-facturation reste exploitable en silence. Aucun filet automatisé sur le flip.

**Fix.** Dans `tests/orders-create.test.ts`, un `describe` qui : (1) stub `process.env.ENFORCE_SHIPPING_SIG='1'`, POST sans `shippingQuoteSig` → 409 + `SHIPPING_QUOTE_INVALID` ; (2) calcule une vraie sig via `shippingQuoteToken({method,price,country:'CA',province,postal,productIds})` cohérente → 200 ; (3) altère le prix de 0.01 après signature → 409 ; (4) var non set → 200 (log-only). Restaurer l'env en `afterEach`. Ajouter aussi un test du cas M1 (`shippingPrice=0` sans sig).

---

### LOW

---

#### L1 — La page produit virtuel /order/v/[slug] ignore enabled Sinalite + overrides admin → config rejetée seulement au paiement
- **Sévérité :** low
- **Dimension :** correctness
- **Fichier :** `src/app/order/v/[slug]/page.tsx:22-33`

**Description.** Le collapse dans `/order/product` construit `virtualSlugs` à partir de `products` déjà filtré par `enabled===1` + `applyProductOverrides`. Mais `/order/v/[slug]` ne consulte ni l'`enabled` Sinalite ni les overrides : `VirtualProductPicker` affiche **tous** les `vp.variants` (mapping statique `virtual-products.ts`). Un variant dont le `productId` est disabled via `ProductOverride` (ou `enabled!==1`) reste sélectionnable. Le garde n'existe qu'à `/api/orders/create` (`PRODUCT_DISABLED` ligne 144, `OPTION_HIDDEN` ligne 154).

**Impact.** L'utilisateur sélectionne un papier/finition désactivé, traverse tout le wizard, puis se fait rejeter à l'étape paiement → abandon de panier. Pas de fuite d'argent (le serveur rejette bien), perte de conversion. Le compteur « N finitions » (`product/page.tsx:138`) est sur-déclaré.

**Fix.** Dans `/order/v/[slug]` (ou `VirtualProductPicker`), charger la liste Sinalite + `applyProductOverrides` et filtrer `vp.variants` aux `productId` réellement actifs avant affichage, comme le fait déjà `/order/product`. À défaut, au minimum recalculer le nombre de finitions affiché.

---

#### L2 — L'email/audit de /cancel sur-annoncent le remboursement après un refund partiel préalable
- **Sévérité :** low
- **Dimension :** money
- **Fichier :** `src/app/api/admin/orders/[id]/cancel/route.ts:60-130`

**Description.** Contrairement à `/refund` (qui borne le cumul via `refunds.list`), `/cancel` appelle `refunds.create` sans `amount` ni calcul du déjà-remboursé. Stripe ne rembourse que le restant (donc `refund.amount` est correct), mais l'email (`sendOrderCancelledEmail`, ligne 108 `refundAmountCents: order.amountCents`) et l'audit (ligne 120) annoncent le **total** d'origine. Après un refund partiel via `/refund` (qui ne change pas le statut → l'order reste annulable), le client voit « Remboursement : <total> $ » alors que ce cancel n'a remboursé que le restant. Cas-limite : si l'order était déjà 100 % remboursé, `refunds.create` full → Stripe renvoie une erreur → 502 brut.

**Impact.** Pas de perte d'argent (cumul Stripe correct), mais l'email promet plus que le virement effectif → litiges/chargebacks, support « je n'ai reçu que X ».

**Fix.** Dans `/cancel`, dériver `alreadyRefundedCents` via `refunds.list` (comme `/refund`), calculer le restant, court-circuiter proprement si restant ≤ 0, et passer le `refund.amount` réel (pas `order.amountCents`) à l'email et à l'audit.

---

#### L3 — La garde anti-tampering prix (PRICE_MISMATCH 409) du checkout n'est pas testée
- **Sévérité :** low
- **Dimension :** tests
- **Fichier :** `src/app/api/orders/create/route.ts:206-216` (test manquant dans `tests/orders-create.test.ts`)

**Description.** Le cœur anti-fraude — recompute serveur du subtotal puis comparaison à `expectedSubtotal` (tolérance 0.05 $) → 409 `PRICE_MISMATCH` — n'a aucun test. Tous les cas envoient `expectedSubtotal:50` qui matche le mock (50), le chemin de divergence n'est jamais exercé. Idem pour le 502 `PRICE_FETCH_FAILED` (lignes 172-177). **La garde elle-même est correcte** (sens du `Math.abs`, guard NaN) — c'est un trou de couverture, pas un bug actif.

**Impact.** Si un refactor casse le check (inverse le `Math.abs`, élargit la tolérance, retire la garde), un client pourrait payer 1 $ pour une commande à 500 $ sans qu'un test ne rougisse.

**Fix.** POST `validPayload` avec `expectedSubtotal:1` → 409 + `code==='PRICE_MISMATCH'`. Test du 502 : `lookupVariant` null + `sinalite.getPrice` renvoyant `{ price: 'NaN' }` → 502 + `PRICE_FETCH_FAILED`.

---

#### L4 — La ré-estimation shipping full-cart multi-items (review) n'a pas de couverture sur le glue-code client
- **Sévérité :** low
- **Dimension :** tests
- **Fichier :** `src/app/order/review/page.tsx:287-313`

**Description.** L'orchestration client multi-items (ré-appel `/api/shipping/estimate`, match `m.method === ship.method`, substitution prix+sig, throws) n'est testée nulle part ; pas d'E2E multi-produits jusqu'au paiement. **Nuance importante :** le risque le plus grave invoqué — mismatch de format `estimate↔create` → 409 systématique — est **déjà couvert** par `tests/shipping-quote-token.test.ts:48-56` (round-trip sig multi-productIds, ordre indifférent) ; `estimate` et `create` partagent la même `canonical`/`shippingQuoteToken`. Le gap réel est limité au glue-code JS du composant review.

**Impact.** Si le glue-code casse : checkout multi-items échoue (« Impossible de recalculer la livraison »), bloquant les paniers à plusieurs articles. Pas de risque crypto silencieux.

**Fix.** Test d'intégration de `/api/shipping/estimate` (mock `sinalite.estimateShipping`) vérifiant que chaque méthode porte une sig telle que `verifyShippingQuoteToken({method,price,country:'CA',province,postal,productIds}) === true`. En complément (plus coûteux), un E2E Playwright « ajouter un 2e produit puis payer ».

---

#### L5 — Champ dénormalisé User.name jamais recalculé hors du flux profil → emails/PDF affichent un nom périmé
- **Sévérité :** low
- **Dimension :** data
- **Fichier :** `src/app/api/orders/create/route.ts:458-462` + `src/lib/db/orders.ts:48-62`

**Description.** `src/lib/account/profile.ts:54` recalcule `name = `${firstName} ${lastName}`` à chaque rectification de profil. Mais les deux autres chemins qui modifient `firstName/lastName` ne touchent jamais `name` : (1) le `prisma.user.update` du user connecté dans orders/create ; (2) `findOrCreateUserByEmail`. Or `src/lib/emails/send.ts:65-66` priorise `user.name ?? [firstName,lastName]`, et `auth.ts:149-152` pose `name` au signup → `name` est typiquement non-null. Après un changement de nom au checkout (ou via M4), `name` reste figé et les emails/PDF (`invoice-pdf.ts:182`) affichent l'ancien nom indéfiniment (auto-réparé seulement si l'user repasse par `/settings`).

**Impact.** Incohérence durable entre `firstName/lastName` (mis à jour) et `name` (figé). Cosmétique (nom d'affichage périmé), déclenchement conditionné (édition active du nom au checkout, rare car formulaire pré-rempli). Pas de fuite/corruption critique.

**Fix.** Centraliser le recompute de `name` partout où `firstName/lastName` changent. Idéalement extraire un helper unique (type `normalizeProfileInput`) importé par les 3 chemins. À résoudre conjointement avec M4 (ne rien écrire sur le User connecté résout aussi celui-ci pour ce chemin).

---

#### L6 — L'opt-in marketing Loi 25 dans auth.ts est protégé par un test miroir (snippet copié), pas par le vrai code
- **Sévérité :** low
- **Dimension :** tests
- **Fichier :** `tests/auth-pending-profile.test.ts:31-49` vs `src/auth.ts:154-158`

**Description.** La règle « on n'écrit `emailMarketing` que sur consentement affirmatif (`=== true`), sinon omis » vit inline dans `src/auth.ts` `events.signIn`. Le test ne l'importe pas : il **réimplémente** le snippet (`parsePendingProfileCookie` défini dans le fichier de test) et teste sa propre copie. Le vrai code de `auth.ts` n'est jamais exécuté par la suite. Le code de prod est correct **aujourd'hui** ; c'est un défaut de qualité de test.

**Impact.** Un refactor de `auth.ts` réintroduisant un opt-in par défaut (`updateData.emailMarketing = pending.emailMarketing`) laisserait les tests 100 % verts tout en violant CASL/Loi 25.

**Fix.** Extraire la logique de parsing/normalisation du cookie pending-profile vers un helper pur exporté (`src/lib/auth/pending-profile.ts` `buildSignupUpdateData`), puis importer ce helper dans le test au lieu de la copie locale.

---

## Plan d'action priorisé

### Sprint 1 — à faire AVANT le flip `ENFORCE_SHIPPING_SIG=1` en prod
1. **M1 — Bypass `shippingPrice=0`** (effort : ~1 h). Sortir la vérif sig de la branche `> 0` (ou re-fetch Sinalite inconditionnel). **Bloquant** : le flip prévu ne ferme pas ce vecteur sans ce fix.
2. **M6 — Tests d'intégration enforce** (effort : ~2-3 h). Filet de sécurité du flip + couvrir le cas M1. À livrer avec M1.

### Sprint 2 — conformité Loi 25 / PIPEDA (risque réglementaire)
3. **H1 — PII en clair dans `sinalitePayload` après PIPEDA** (effort : ~2-3 h). Ré-écriture du JSON dans la transaction de suppression. Contredit directement le courriel envoyé au client → priorité réglementaire.
4. **M5 — Redaction `to` dans le logger** (effort : ~30 min). Ajout de chemins à `REDACT_PATHS` + test. Quick win à fort volume.

### Sprint 3 — intégrité financière & données
5. **H2 — Reset d'état review (PaymentIntent périmé)** (effort : ~1 h). 4 lignes de reset au début de l'effet ; ferme aussi le bandeau d'erreur périmé.
6. **M2 + M3 — Double-dip wallet + referral** (effort : ~3-4 h). **Un seul correctif de sérialisation par `userId`** (`SELECT … FOR UPDATE`, pattern déjà présent dans `processWalletTopup`) couvre les deux crédits. Restauration sur abandon/échec à câbler.
7. **M4 + L5 — Écrasement profil + name périmé** (effort : ~1 h). Option (b) : ne rien écrire sur le User connecté → résout les deux d'un coup pour ce chemin.

### Sprint 4 — robustesse & dette de test (faible urgence)
8. **L1 — Filtrage enabled/overrides sur `/order/v/[slug]`** (effort : ~1-2 h). Conversion.
9. **L2 — `/cancel` borne le remboursement** (effort : ~1 h). Aligner sur `/refund`.
10. **L3, L4, L6 — Combler les trous de test** (effort : ~3-4 h cumulés). Aucun bug actif, mais garde-fous contre régression future ; L6 implique une petite extraction de helper.

### Effort total estimé
~18-22 h de travail réparties sur 4 sprints. Aucun finding ne requiert de refactor d'architecture. Les deux fixes les plus rentables (M1+M6, H1) tiennent en moins d'une journée combinée et adressent les deux risques concrets : fuite de marge au flip et non-conformité à l'effacement.
