# Roadmap — la suite (juin 2026)

> Point de situation après le gros chantier **MCP / IA commerce** + **audits mobiles**.
> Légende propriétaire : 👤 = action **toi** (business / accès externes) · 🤖 = code (je le fais sur demande) · 🔒 = bloqué par un tiers.

---

## Où on en est (résumé)

- **Serveur MCP « commander Plio par IA »** : LIVRÉ et **en prod**. Lecture (catalogue, devis, livraison) + `create_order` Mode A (lien de finalisation) fonctionnent en clés API statiques. Mode B (paiement headless Stripe) est **bâti, revu adversarialement, durci** — mais derrière flag `MCP_CREATE_ORDER_PAY=off`.
- **OAuth (listing public Claude/ChatGPT)** : tout le code mergé, découverte PRM **live en prod** (pointe le tenant WorkOS prod). Inerte sans risque tant que le flag n'agit pas.
- **Déploiement** : pipeline Amplify débloqué (OOM #364, whitelist env `MCP_` #369). `node scripts/check-deploy.mjs` = sonde « prod à jour ? ».
- **Mobile** : audits menu + login + **overflow systémique** clos (#371-377). Bugs racine = CSS legacy dupliqué non gardé par `@media`.

---

## P0 — Débloquer / activer (en attente externe ou décision)

| # | Item | Propriétaire | État / blocage |
|---|------|--------------|----------------|
| 1 | **Activer OAuth** : WorkOS doit activer **DCR + CIMD** (RFC 7591) sur le tenant prod `fearless-rabbit-95.authkit.app` | 🔒 WorkOS (email envoyé) | Dès que `registration_endpoint` apparaît → 🤖 je teste la connexion depuis Claude + **je vérifie le `aud` d'un vrai token** (invariant H2). Puis soumission aux annuaires Claude/ChatGPT. |
| 2 | **Activer Mode B** (paiement headless via IA) : poser `MCP_CREATE_ORDER_PAY=1` | 👤 décision business | Code complet + revu + 3 durcissements before-GA faits (#358-360). À activer quand tu veux ouvrir le paiement-par-IA, puis vérifier CloudWatch au 1er paiement réel. |
| 3 | **Activer `ENFORCE_SHIPPING_SIG=1`** en prod (rejette les devis de port non signés/altérés) | 👤 + vérif | Code prêt (#309/#311, panier complet). À activer après une passe de logs CloudWatch (confirmer qu'aucun trafic légitime n'est rejeté). |
| 4 | **Tester sur vrai téléphone** les fixes mobiles : homepage, `/quote`, login, menu (+ `/admin` sur tablette) | 👤 | Le preview valide les dimensions, pas le ressenti d'un doigt sur écran à encoche. À faire après le prochain build. |

---

## P1 — Dette technique à valeur (code, prêt quand tu veux) 🤖

| # | Item | Pourquoi | Effort / risque |
|---|------|----------|-----------------|
| 5 | **Dédup `globals.css`** (cause racine des overflows) | 16 000 lignes avec des **pages HTML legacy collées** → doublons de classes (`auth-shell`, `two-col`, `adm-shell`…) ; une 2e déf non gardée écrase un collapse `@media` → layout cassé sur mobile. On a patché les **symptômes** (#375-377 overrides EOF) ; la **racine** demeure → d'autres overflows latents probables. | Moyen/Élevé. Approche : balayage runtime de TOUTES les pages (y compris auth-gated, avec une session de test) + dédup prouvée-identique comme #339. À faire prudemment. |
| 6 | **Audit v3 M2/M3** — double-dip wallet/referral concurrent | Deux checkouts simultanés peuvent consommer 2× le même crédit (course). Chip `task_96f7bfbd`. | Décision archi (verrou applicatif vs garde DB) puis implémentation. Money-critical → revue adversariale. |
| 7 | **Sonde post-deploy en CI/cron** | `merged ≠ deployed` nous a coûté du temps (MCP 404, env whitelist). Intégrer `check-deploy.mjs` en cron ou post-build pour alerter si la prod diverge de `main`. | Faible. Réutilise l'infra `/admin/crons` + alertes Slack. |

---

## P2 — Décisions business / légales (toi) 👤

| # | Item | Détail |
|---|------|--------|
| 8 | **Privacy Loi 25 / LPRPDE** | 🔴 Numéros fiscaux **factices** dans les CGU (chip `task_f2f6e68a`) ; opt-in marketing pré-coché à revoir ; **DPD** (responsable protection des données) non nommé. Conformité globale solide (#310), reste = décisions à prendre. |
| 9 | **B1 List-Unsubscribe** (abandoned-cart) | NE PAS ajouter à `MARKETING_TEMPLATES` tant que volume < ~5k/j (CASL déjà OK via lien body). À réévaluer quand le volume monte. |

---

## P3 — Backlog / features (quand le cœur est stable)

| # | Item | Note |
|---|------|------|
| 10 | **Listing annuaire public** Claude/ChatGPT | Dépend de P0-#1 (OAuth actif). Soumission + callbacks déjà enregistrés côté WorkOS. |
| 11 | **Wizard : fusionner les produits Sinalite semblables** | Demande user #3, différée — besoin de la vraie liste produits (productId distincts par papier/finition). |
| 12 | **Plus de tools MCP** | Ex. statut de commande, re-commande, suivi de livraison — à prioriser selon l'usage réel du MCP une fois OAuth ouvert. |

---

## Prochaine action concrète

**Côté toi** : surveiller l'email WorkOS (DCR) + décider du timing d'activation Mode B / shipping-sig + tester le mobile sur téléphone.
**Côté moi (sur demande)** : la dédup `globals.css` (#5) est le chantier code le plus à valeur — il supprime la *classe* de bug qui a généré tous les overflows, au lieu de patcher au cas par cas.
