# Audit de la section admin — Plio (2026-07-06)

> Workflow multiagent `audit-admin-section` (31 agents, 8 dimensions, vérif adversariale). **50 findings bruts → 19 confirmés matériels / 28 mineurs / 3 rejetés.** Portée : 39 routes `/api/admin/**` + 31 pages `/admin/**` + composants d'action, exports finances/fiscaux, nav, mobile/a11y.

## Verdict global
**Section admin SAINE. Zéro défaut critique, aucune perte cash directe sur refund/cancel.** Autorisation **exemplaire** (100 % routes/pages gardées, CSRF partout, Zod strict, audit log systématique). Le cœur money-critical (refund/cancel) est déjà lourdement durci.

Les vrais risques, **tous hors chemin de paiement**, en 3 foyers :
1. **💰 Chiffres comptables/fiscaux faux** (le plus sérieux) — 4 surfaces finances comptent différemment les commandes remboursées ; l'export XLSX gonfle le revenu, le tax-report sur-déclare TPS/TVQ sur des ventes remboursées (**risque CRA/Revenu Québec**).
2. **🧩 Feedback email mensonger** — des boutons affichent « ✓ Envoyé » alors que l'email a été droppé (opt-out/bounce/throttle en HTTP 200).
3. **🔴 Révocation admin non immédiate** — rôle ADMIN figé dans le JWT (jusqu'à 30 j).

Le reste (~20 items) = **polish UX** réel mais non risqué + gaps fonctionnels (dont la case `chargeCancelFee`).

---

## 🔴 Sécurité / autorisation
- **2.1 — Rôle ADMIN figé dans le JWT (révocation ≤ 30 j)** · MOYEN · `auth.ts:217`. Le callback `jwt` ne relit le rôle que si `user?.id` présent (connexion initiale) ; pas de `maxAge`. Un admin rétrogradé/congédié garde ses accès jusqu'à expiration du token. **Fix** : re-résoudre le rôle à chaque rotation (`findUnique` role/email quand `!user`), ou `maxAge` court (24 h).
- **2.2 — Fuite d'existence `/admin` via `?forbidden=admin`** · FAIBLE · `middleware.ts:66`. Contredit le `notFound()` de `requireAdminPage`. **Fix** : une seule stratégie (masquer OU signaler).

## 💰 Money-critical admin (faux chiffres, pas de perte cash)
Cause de fond : un refund ne change ni `paidAt` ni le statut (`markRefundIssued` crée juste un `OrderEvent`) → les commandes remboursées survivent aux filtres. **4 surfaces finances définissent différemment « commande génératrice de revenu ».**
- **3.1 — Export XLSX compte annulées/remboursées dans le revenu brut** · **ÉLEVÉ** · `finances/export/route.ts:72`. `findMany({where:{paidAt}})` sans filtre statut, jamais net des refunds. **Fix** : filtrer `PAID_STATUSES` + soustraire `REFUND_ISSUED` (réutiliser `refundAmountCentsOf`). Aligner les 4 surfaces.
- **3.2 — Tax-report sur-déclare la taxe sur ventes remboursées (CRA/RQ)** · MOYEN · `finances/tax-report/route.ts:68`. Un refund sans `cancelOrder` laisse la commande PAID → `taxCents` déclaré à 100 %. **Fix** : joindre `REFUND_ISSUED`, réduire subtotal/tax au prorata.
- **3.3 — Dashboard finances inclut CANCELLED/FAILED** · MOYEN · `finances/page.tsx:83`. `revenueAgg`/province/tax/topCustomers n'excluent pas — alors que `revenueByUserId` le fait. **Fix** : `status:{notIn:['CANCELLED','FAILED']}` partout.
- **3.4 — CSV filtre `createdAt`, XLSX filtre `paidAt`** · FAIBLE · `orders/export/route.ts:50`. Jeux différents en bord de mois. **Fix** : harmoniser sur `paidAt`.
- **3.5 — Refund partiel referral : aucune alerte** (PLAUSIBLE) · FAIBLE · `refund/route.ts:175`. L'alerte crédit-non-restauré couvre seulement le wallet ; `referralCreditAppliedCents` oublié. **Fix** : étendre la condition + le corps de l'alerte.
- **3.6 — XLSX « Revenu total » = net des crédits mais nommé « brut »** · FAIBLE. **Fix** : colonnes crédits + libellé précis.
> Rassurance : le **bulk n'applique aucune action money** ; invariants refund/cancel intacts.

## 🧩 Fonctionnel — succès mensongers / états optimistes
Foyer : des envois d'email affichent un succès alors que `queueEmail` a retourné `{sent:false}` en 200 (le champ `data.sent` n'est jamais lu).
- **4.1 — `SendCustomMessageButton` : « ✓ Envoyé » sur email droppé** · **ÉLEVÉ** · `SendCustomMessageButton.tsx:41`. **Fix** : lire `data.sent`.
- **4.2 — `OrderActions` : « ✓ Email renvoyé OK » codé en dur** · MOYEN · `OrderActions.tsx:55`. (`EmailRetryButton`/`bulkResendConfirmation` le gèrent bien → incohérence.) **Fix** : remonter `sent`.
- **4.3 — `MessageActions.sendReply` ferme/vide le drawer AVANT confirmation** · MOYEN · `MessageActions.tsx:76`. Perte de la réponse rédigée si échec. **Fix** : ne fermer/vider qu'au succès.
- **4.4 — `ExperimentToggle` double-clic possible** · FAIBLE · `ExperimentToggle.tsx:27`. Fausse la collecte A/B. **Fix** : `if (pending) return` + fetch dans `startTransition`.
- **4.5 — `AdminNotesPanel` autosave sans garde de concurrence** · FAIBLE · `AdminNotesPanel.tsx:40`. **Fix** : `AbortController`.

## 🎨 UI/UX & cohérence
- **5.1 — Badges sidebar incohérents** (source canonique `getAdminSidebarCounts` ignorée sur ~17 pages) · MOYEN · `sidebar-counts.ts:47`. **Fix** : l'appeler dans un layout partagé.
- **5.2 — Pastilles « urgent » visibles seulement sur leur page** · FAIBLE. **Fix** : `getAdminUrgentCounts()` global.
- **5.3 — Pastille urgent webhooks codée `true` sur /orders** · MOYEN · `orders/page.tsx:155`. Fausse alarme permanente. **Fix** : vraie condition.
- **5.4 — Mapping urgent faux au dashboard** (commandes échouées → pastille Webhooks) · MOYEN · `admin/page.tsx:252`.
- **5.5 — Items nav Finances (produits/tax-report) jamais actifs** · MOYEN · `active="finances"`. **Fix** : clés dédiées.
- **5.6 — `/admin/newsletter` absente de la sidebar + clé morte** · MOYEN.
- **5.7 — Sidebar sans déconnexion ni retour au site** · MOYEN · `AdminSidebar.tsx:235`.
- **5.8 — Journal d'audit « Tous » non paginable** · FAIBLE · `audit/page.tsx:301`.
- **5.9 — Feedback de succès incohérent** (bannière verte vs silence) · MOYEN. **Fix** : toast admin partagé.
- **5.10 — 4 implémentations de pagination** · FAIBLE. **Fix** : migrer vers `AdminPagination`.
- **5.11 — Divers polish** : titres inline, skeleton générique, breadcrumbs hétérogènes, `window.prompt` rejet review, toggle promo sans confirm, sélection bulk perdue à la pagination.

## 📱 Mobile & a11y
- **6.1 — Scroll horizontal des tables = 1 règle dans `migrated-pages.css` (généré/déprécié)** · FRAGILE (P1) · `migrated-pages.css:419`. Les panels sont `overflow:hidden` ; le seul filet mobile vit dans un fichier régénérable. Si retiré → colonnes de droite (Total/Statut/Actions) invisibles à 375 px. **Fix** : déplacer le filet en EOF `globals.css`.
- **6.2 — Hamburger fixe recouvre titre/breadcrumb mobile** · MOYEN · `migrated-pages.css:241`.
- **6.3 — `.adm-select` déclenche le zoom iOS + < 44 px** · MOYEN · `globals.css:7637`.
- **6.4 — `<select>` filtre webhooks sans nom accessible** · MOYEN · `webhooks/page.tsx:280`.
- **6.5 — `<th>` sans `scope`, boutons bulk < 44 px** · FAIBLE.

## ⚡ Performance
**Aucun défaut confirmé** — pas de requête non bornée dangereuse, pas de N+1, pas de floating promise Lambda dans l'admin. Caps Zod en place.

## ✨ Gaps & quick-wins
- **8.1 — Case `chargeCancelFee` absente de l'UI (perte cash par omission)** · MOYEN (gap phare) · `OrderActions.tsx:133`. L'API l'accepte déjà ; sans la case, Plio absorbe ≥ 25 $/article à **chaque** annulation post-production. **Fix** : checkbox visible si status ∈ {SUBMITTED, IN_PRODUCTION} + aperçu retenu/remboursé.
- **8.2 — Impossible de faire avancer le statut depuis la fiche commande** · MOYEN · `OrderActions.tsx:136`. Détour par le bulk pour SHIPPED/IN_PRODUCTION/DELIVERED. **Fix** : groupe « Faire avancer » + route `/orders/[id]/status`.
- **8.3 — `replay-sinalite` régresse une commande valide en FAILED sur erreur transitoire** · MOYEN · `replay-sinalite/route.ts:80`. `markOrderFailed` inconditionnel dans le catch. **Fix** : ne FAILED que si le statut d'entrée le justifie ; sinon `OrderEvent ERROR` + alerte.
- **8.4 — Filtre « high-value » tronque au-delà de 400 users** · FAIBLE · `users/page.tsx:148`. LTV post-fetch en mémoire. **Fix** : LTV côté SQL.
- **8.5 — Fiche commande** : tracking jamais affiché (enfoui dans le JSON), refund ne montre pas le restant remboursable, pas d'ajustement wallet/geste commercial, pas de tri par colonne.
- **8.6 — Audit trail** : sur-usage du kind `ADMIN_TEMPLATE_EDIT`, `targetType` incorrects → liens « Cible » morts.

---

## Récap priorisé

| Prio | Item | Sévérité | Fichier |
|------|------|----------|---------|
| **P0** | 3.1 Export XLSX compte annulées/remboursées | Élevé | `finances/export/route.ts:72` |
| **P0** | 4.1 « ✓ Envoyé » sur email droppé | Élevé | `SendCustomMessageButton.tsx:41` |
| **P0** | 3.2 Tax-report sur-déclare la taxe (CRA/RQ) | Moyen | `finances/tax-report/route.ts:68` |
| **P0** | 2.1 Rôle ADMIN figé dans le JWT | Moyen | `auth.ts:217` |
| **P0** | 8.1 Case `chargeCancelFee` absente (perte cash) | Moyen | `OrderActions.tsx:133` |
| **P1** | 8.3 `replay-sinalite` → FAILED transitoire | Moyen | `replay-sinalite/route.ts:80` |
| **P1** | 4.2 « ✓ Email OK » ignore `data.sent` | Moyen | `OrderActions.tsx:55` |
| **P1** | 4.3 `sendReply` ferme avant confirmation | Moyen | `MessageActions.tsx:76` |
| **P1** | 3.3 Dashboard inclut CANCELLED/FAILED | Moyen | `finances/page.tsx:83` |
| **P1** | 5.1 Badges sidebar incohérents | Moyen | `sidebar-counts.ts:47` |
| **P1** | 5.3 Pastille webhooks `true` en dur | Moyen | `orders/page.tsx:155` |
| **P1** | 6.1 Scroll tables = fichier généré | Fragile | `migrated-pages.css:419` |
| **P1** | 8.2 Pas de transition statut depuis la fiche | Moyen | `OrderActions.tsx:136` |
| **P1** | 3.5 Refund partiel referral : aucune alerte | Faible | `refund/route.ts:175` |
| **P2** | 3.4, 4.4, 4.5, 5.4-5.11, 6.2-6.5, 8.4-8.6, 2.2, 5.8 | Faible-Moyen | (voir sections) |

## Top 5 à faire en premier
1. **§3.1 (+3.2/3.3/3.4)** — aligner les 4 surfaces finances sur une définition nette-des-refunds *(P0 money/data ; le comptable exporte des chiffres qui ne rapprochent pas Stripe)*.
2. **§4.1+§4.2** — lire `data.sent` sur les envois d'email admin *(P0 fonctionnel ; ~10 lignes, le pattern correct existe déjà)*.
3. **§3.2** — déduire les refunds du tax-report *(P0 fiscal ; sur-paiement TPS/TVQ = risque légal)*.
4. **§2.1** — rafraîchir le rôle admin à la rotation du JWT *(P0 sécu ; révocation sinon inopérante ≤ 30 j)*.
5. **§8.1** — exposer la case `chargeCancelFee` *(P0 money ; le seul qui fait perdre du cash à CHAQUE occurrence ; backend déjà prêt)*.
