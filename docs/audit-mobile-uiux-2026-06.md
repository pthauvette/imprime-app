# Audit UI/UX Mobile — Plio (imprime-app)

Date : 2026-06-07
Cible : smartphone ~375px (iPhone SE/standard), tactile, iOS Safari + Android Chrome
Périmètre : `src/styles/globals.css` (16155 l.) + `src/styles/migrated-pages.css` (6042 l.) + composants/pages `src/app/*`, `src/components/*`
Méthode : lecture du CSS/JSX réel (Grep/Read/Bash), vérification adversariale de chaque finding (recherche d'un override @media plus bas avant de signaler).

---

## Résumé exécutif

État général du mobile : **MOYEN — avec UN bug bloquant critique.**

Le socle responsive existe (viewport `viewportFit: cover`, zoom autorisé, nombreux breakpoints, grilles qui collapsent souvent en 1 colonne, inputs principaux qui héritent 16px du body). Le projet n'est PAS un désastre mobile : la majorité des pages se comportent correctement. **Mais** un défaut unique casse le tunnel d'achat sur smartphone, et deux faiblesses transversales (zéro `env(safe-area-inset-*)` alors que `viewportFit: cover` est actif ; zéro `100dvh`) dégradent le confort sur tout le parcours.

### Compte par sévérité (findings dédupliqués)

| Sévérité | Nombre |
|----------|--------|
| Critical | 1 |
| High     | 3 |
| Medium   | 9 |
| Low      | 12 |
| **Total** | **25** |

(35 findings bruts en entrée → 25 après déduplication ; ~10 doublons fusionnés, surtout autour du footer wizard, du safe-area et des inputs <16px qui revenaient sous plusieurs dimensions.)

### Thèmes dominants

1. **BLOCAGE CHECKOUT (critical, 1 finding).** Le formulaire de paiement Stripe + le bouton « Confirmer la commande » vivent dans `.recap`, qui est `display: none` sous 1100px sans aucun override. **Paiement littéralement impossible sur mobile.** Priorité absolue, à corriger immédiatement.

2. **Footer sticky du wizard + absence totale de safe-area (medium, ~5 findings fusionnés).** `viewportFit: cover` est déclaré mais `env(safe-area-inset-*)` n'apparaît **nulle part** dans 22k lignes de CSS. Le footer CTA du wizard (`.shell-footer`, grille 3 colonnes figée + 64px de padding, jamais reflowée en mobile) passe sous le home indicator iOS, garde un hint clavier inutile au tactile, et comprime le CTA principal.

3. **Zoom iOS au focus des inputs <16px (medium, ~7 findings fusionnés).** Plusieurs inputs/textarea en `font-size` 12–15px (inline-style ou classes admin) déclenchent le zoom auto de Safari. Les plus graves sont sur le chemin d'argent : code promo (13px, page paiement) et textarea instructions livraison (14px). Les inputs principaux du wizard sont OK (héritent 16px).

4. **Cibles tactiles < 44px (medium/low, ~7 findings).** Boutons « Retirer » du panier/promo (11px sans hit-area), « × » de modales (glyphe nu), nav de compte mobile (~32px), finish-pills (~30px), cellules NPS (36px), burger admin (40px).

5. **Recap/prix qui ne stacke pas en mobile + overflow horizontal (high/low).** Au-delà du blocage paiement, le panneau prix LIVE du configurateur disparaît avec `.recap` ; le padding `.step-content` reste à 64px sur 375px à cause d'une collision de cascade ; la nav de compte est une bande de 15 liens scrollable sans repère.

---

## Findings détaillés par thème

### THÈME 1 — Blocage du checkout (CRITICAL)

#### 1.1 Le paiement Stripe est dans `.recap`, masqué sous 1100px → paiement impossible sur mobile
- **Sévérité : critical**
- **Fichier :** `src/app/order/review/page.tsx:563-604` + `src/styles/globals.css:3931-3934`
- **Preuve (vérifiée) :** `review/page.tsx:563` `<aside className="recap">` contient `<Elements>…<PaymentForm total={breakdown.total}/></Elements>` (l. 579-604) ; `PaymentForm` rend `<PaymentElement/>` + le bouton « Confirmer la commande ». `globals.css:3933` : `@media (max-width: 1100px) { .recap { display: none; } }`. Recherche exhaustive : la SEULE règle `display` touchant `.recap` est ce `none` (aucun override ne le ré-affiche). Le footer de review (`page.tsx:615-625`) ne contient PAS de bouton payer — seulement « Précédent » + le texte « PAIEMENT VIA STRIPE ».
- **Impact mobile :** À 375px, l'étape 6 n'affiche aucun champ carte ni bouton de confirmation. 100 % des commandes mobiles sont bloquées à la dernière étape — perte sèche de revenu sur tout le trafic smartphone.
- **Fix :** Ne PAS réutiliser `.recap` pour le paiement. Sortir le bloc `Elements`/`PaymentForm` dans un conteneur propre toujours visible (sous `.step-content` en flux normal, ou classe `.checkout-pay` sans `display:none` mobile). En 1 colonne, PaymentElement + bouton suivent le récap dans le flux. Vérifier `height ≥ 44px` sur « Confirmer » (btn-lg OK).
- **Effort : M**

---

### THÈME 2 — Footer CTA wizard + safe-area (viewportFit cover non géré)

#### 2.1 Aucun `env(safe-area-inset-*)` dans tout le CSS alors que `viewportFit: cover`
- **Sévérité : medium**
- **Fichier :** `src/styles/globals.css` + `src/styles/migrated-pages.css` (grep `env(safe-area` = **0 occurrence** sur 22k lignes) ; `layout.tsx` `viewportFit: 'cover'`
- **Preuve :** Éléments bas fixes/sticky sans padding safe-area : `.shell-footer { position: sticky; bottom: 0 }` (globals.css:267-276) ; `CookieConsent` `bottom:16` ; `FloatingHelpButton` FAB `bottom:24` ; `NpsWidget` FAB.
- **Impact mobile :** Sur iPhone à encoche/Dynamic Island, la home-bar (~34px) recouvre le bas du footer sticky du wizard, le bouton « OK compris » du bandeau cookie et le FAB. Android gestuel : même chevauchement. CTA partiellement masqués.
- **Fix :** `padding-bottom: env(safe-area-inset-bottom)` sur les éléments bas fixes/sticky. `.shell-footer` : `padding-bottom: max(0px, env(safe-area-inset-bottom))`. CookieConsent/FAB : `bottom: calc(Xpx + env(safe-area-inset-bottom))`.
- **Effort : M**

#### 2.2 `.shell-footer` en grille 3 colonnes (`1fr auto 1fr`, padding 0 32px) jamais reflowée sur mobile
- **Sévérité : medium**
- **Fichier :** `src/styles/globals.css:267-284` (aucune @media mobile) ; utilisé par `ConfigureClient.tsx:304`, `shipping/page.tsx:368`, `review/page.tsx:615`, `upload/page.tsx:275`, `VirtualProductPicker.tsx:173`
- **Preuve (vérifiée) :** `grid-template-columns: 1fr auto 1fr; padding: 0 32px`. Le header a un `@media(max-width:700px)` mais PAS le footer. `.shell-footer-center` (texte « ↵ Entrée pour continuer ») n'est jamais `display:none` en mobile.
- **Impact mobile :** À 375px, 64px de padding + colonne centrale (hint clavier inutile au tactile) volent la largeur ; « Précédent » et le CTA primaire long (avec prix) se compriment/tronquent dans une rangée figée à 80px.
- **Fix :** `@media (max-width:700px) { .shell-footer { grid-template-columns: auto 1fr; padding: 12px 16px } .shell-footer-center { display:none } }` pour donner toute la largeur au CTA.
- **Effort : S** (combiner avec 2.1)

#### 2.3 Burger admin 40×40px (< 44px) sans safe-area-inset-top
- **Sévérité : low**
- **Fichier :** `src/styles/globals.css:10259-10277` (`.adm-nav-burger`) ; `AdminNavToggle.tsx:51-59`
- **Preuve :** `position: fixed; top: 12px; left: 12px; width: 40px; height: 40px`.
- **Impact mobile :** Seul moyen d'ouvrir la nav admin sous 1024px, sous le minimum tactile ; à `top:12px` sans inset, flirte avec la barre d'état en encoche.
- **Fix :** `width/height: 44px; top: calc(12px + env(safe-area-inset-top)); left: calc(12px + env(safe-area-inset-left))`.
- **Effort : S**

---

### THÈME 3 — Zoom iOS au focus des inputs < 16px

> Règle : iOS Safari zoome automatiquement tout `<input>/<textarea>` dont `font-size < 16px` au focus (viewport sans `maximum-scale`). Aucune règle globale `input { font-size: 16px }` n'existe. Les inputs principaux (`.field`, shipping de base) héritent 16px du body → OK. Seuls les champs avec `font-size` explicite < 16px sont touchés.

#### 3.1 Champ code promo (page paiement) à 13px
- **Sévérité : medium** — **Fichier :** `src/app/order/review/page.tsx:892-901`
- **Preuve :** `style={{ …fontSize:13, fontFamily:'var(--font-mono)' }}` inline, aucun reset. Sur la dernière étape avant Stripe.
- **Fix :** `fontSize: 16`. **Effort : S**

#### 3.2 Textarea instructions de livraison à 14px
- **Sévérité : low** — **Fichier :** `src/app/order/shipping/page.tsx:304-321`
- **Preuve :** `fontSize:14`, `fontFamily:'inherit'` ne réinitialise pas la taille. Étape 05/06.
- **Fix :** `fontSize: 16` (ou `font:'inherit'` APRÈS fontSize). **Effort : S**

#### 3.3 Inputs du formulaire de suivi de commande à 14px
- **Sévérité : low** — **Fichier :** `src/app/track/TrackingForm.tsx:121-135, 150-165`
- **Preuve :** deux champs `fontSize:14` sans `font:'inherit'`. Ouvert souvent depuis un courriel mobile.
- **Fix :** `font:'inherit'` après fontSize, ou `fontSize:16`. **Effort : S**

#### 3.4 Inputs/textarea des modals (FloatingHelpButton, NPS) à 14px
- **Sévérité : medium** — **Fichier :** `FloatingHelpButton.tsx:291-299` ; `NpsAutoPrompt.tsx:255` ; `NpsWidget.tsx`
- **Preuve :** `inputStyle = { …fontSize:14 }` inline appliqué à input name/email/textarea ; textarea NPS `fontSize:14`.
- **Fix :** `fontSize: 16` sur tous. **Effort : S**

#### 3.5 Inputs de recherche admin à 12–15px
- **Sévérité : medium (recherche users/orders 13px) / low (éditeur/webhooks 12px, templates 15px)**
- **Fichier :** `globals.css:11635` (`.usr-search` 13px), `globals.css:10879-10887` (`.ord-search` 13px), `globals.css:12902-12907` (`.ed-input-wrap` 12px), `globals.css:13813-13825` (`.adm-search-input` 12px), `globals.css:9119` (`.tpl-search` 15px) ; dupliqué `migrated-pages.css:1415`
- **Preuve :** classes réellement rendues (confirmé dans `admin/users/page.tsx`, `admin/orders/page.tsx`, `admin/webhooks/page.tsx`).
- **Fix :** `@media (max-width:700px) { … input { font-size: 16px } }`. **Effort : S**

#### 3.6 Code postal shipping sans `inputMode` ni `autoComplete=postal-code`
- **Sévérité : low** — **Fichier :** `src/app/order/shipping/page.tsx:254-262`
- **Preuve :** pas d'autofill ; ce champ débloque le calcul des frais de port (useEffect l.116).
- **Fix :** `autoComplete="postal-code"` (laisser le clavier texte — format CA alphanumérique). **Effort : S**

#### 3.7 Champs contact du funnel shipping sans `autoComplete`/`inputMode` (composant `Field` ne les supporte pas)
- **Sévérité : medium** — **Fichier :** `src/app/order/shipping/page.tsx:451-466` (Field), usages 209-214, 237, 239
- **Preuve :** `Field` ne reçoit que `{ label, value, onChange, type, invalid }` — aucun `autoComplete`/`inputMode` passable. Email type=email mais sans `autoComplete="email"`, tel type=tel sans `autoComplete="tel"`.
- **Impact :** Étape 05/06 (point de conversion critique) sans autofill Keychain/Contacts → friction maximale au pouce.
- **Fix :** Étendre `Field` pour forwarder `autoComplete`/`inputMode` (Prénom `given-name`, Nom `family-name`, Email `email`, Tél `tel`, Ville `address-level2`, Adresse 2 `address-line2`). S'inspirer de `SignUpForm` qui le fait déjà. **Effort : S**

---

### THÈME 4 — Cibles tactiles < 44px

#### 4.1 Nav de compte mobile : bande de 15 liens scrollable, sans repère, cibles ~32px
- **Sévérité : high** — **Fichier :** `globals.css:683-704` ; `Sidebar.tsx:46-72`
- **Preuve :** `@media (max-width:900px){ .acct-nav{ overflow-x:auto; white-space:nowrap } .acct-nav-section{ display:none } .acct-nav-link{ padding:8px 12px; font-size:13px } }` — 15 liens concaténés en une rangée nowrap, aucun gradient/flèche de scroll, lien actif possiblement hors écran, cibles ~32px.
- **Fix :** drawer/burger (comme admin) ou min : indicateur de scroll (mask/gradient), scroll-snap, padding vertical ≥12px (cible ≥44px), auto-scroll vers `.active` au montage. **Effort : M**

#### 4.2 Bouton « Retirer » du panier (review) : 11px sans hit-area
- **Sévérité : medium** — **Fichier :** `src/app/order/review/page.tsx:427-433`
- **Preuve :** `<button … style={{ background:'transparent', border:'none', fontSize:11 }}>Retirer</button>` — seul moyen de retirer un article avant paiement, hit ≈ 14-16px.
- **Fix :** `padding:'10px 12px', minHeight:44`, fontSize 12-13. **Effort : S**

#### 4.3 Bouton « Retirer » du code promo : même cible 11px
- **Sévérité : low** — **Fichier :** `src/app/order/review/page.tsx:878-880`
- **Fix :** `padding:'8px 10px', minHeight:44`. **Effort : S**

#### 4.4 Boutons « × » de fermeture des modales (glyphe nu)
- **Sévérité : medium** — **Fichier :** `CancelRequestButton.tsx:105` ; `SendCustomMessageButton.tsx:104`
- **Preuve :** `<button … style={{ fontSize:22 }}>×</button>` — aucun padding/width/height ; hit ≈ taille du glyphe.
- **Fix :** composant close partagé `padding:8, minWidth:44, minHeight:44, display:'grid', placeItems:'center'`. **Effort : S**

#### 4.5 Liens nav marketing mobile (<700px) : 13px, 6px de row-gap
- **Sévérité : low** — **Fichier :** `migrated-pages.css:4255-4262`
- **Fix :** `.mkt-nav-link { padding: 8px 6px }`, row-gap 10-12px. **Effort : S**

#### 4.6 Finish-pills du wizard : ~30px
- **Sévérité : low** — **Fichier :** `globals.css:4759-4767`
- **Preuve :** `padding: 8px 16px; font-size: 13px` → hauteur ~30-32px, gap 6px.
- **Fix :** `min-height:44px` (via `@media (hover:none)` pour ne pas grossir au desktop), gap ≥8px. **Effort : S**

#### 4.7 Ticks de quantité (slider-tick) : ~27px, serrés en space-between
- **Sévérité : low** — **Fichier :** `globals.css:5162-5172` ; `ConfigureClient.tsx:206-218`
- **Atténuation :** l'`<input type=range>` superposé reste draggable (besoin principal couvert).
- **Fix :** `padding: 8px` vertical, min-height ~44px sur la zone cliquable. **Effort : M**

#### 4.8 Cellules NPS 0-10 à 36px
- **Sévérité : low** — **Fichier :** `NpsAutoPrompt.tsx:194` ; `NpsWidget.tsx:122`
- **Preuve :** `repeat(11, minmax(36px, 1fr))` — le commentaire reconnaît le problème mais reste sous 44px.
- **Fix :** `minmax(44px, 1fr)` (l'overflow-x existant absorbe). **Effort : S**

---

### THÈME 5 — Recap/overflow/typo (stacking & lisibilité)

#### 5.1 Prix LIVE du configurateur dans `.recap` → invisible sur mobile pendant le réglage du slider
- **Sévérité : low** (le total reste lisible dans le bouton footer) — **Fichier :** `ConfigureClient.tsx:227-301` + `globals.css:3933`
- **Preuve :** sous-total, $/unité, économie, teaser volume tous dans `.recap` (display:none <1100px). Le slider reste visible mais son feedback prix est masqué.
- **Fix :** résumé prix compact en flux mobile sous le slider, ou bandeau sticky bas. Réutiliser `currentPrice/unitPrice/savingsPct`. **Effort : M**

#### 5.2 Collision de cascade : `.step-content` garde 64px de padding sur 375px
- **Sévérité : high** — **Fichier :** `globals.css:5956` (vs overrides @media 3940, 4184)
- **Preuve (vérifiée) :** `.step-content` redéfini 6 fois en global (templates concaténés). Dernière déclaration INCONDITIONNELLE `padding: 56px 64px` (l.5956) APRÈS les `@media (max-width:900px) { padding:…24px }` (l.3940, 4184). Même spécificité → l'ordre source gagne → 64px persistent sur mobile. Les commentaires JSX (`shipping/page.tsx:197`, `review/page.tsx:404`) montrent que l'intention était l'inverse.
- **Impact :** sur 375px, 128px de padding horizontal → ~247px utiles. Champs/boutons/récap écrasés sur tout le wizard.
- **Fix :** override mobile APRÈS la l.5956 (ou en fin de fichier) : `@media (max-width:700px) { .step-content { padding: 32px 16px } }`. Idéalement scoper par page (`.order-shipping .step-content`) pour tuer la collision à la racine.
- **Effort : S**

#### 5.3 Modals NPS sans `max-height`/scroll interne → contenu inatteignable en paysage/petit écran
- **Sévérité : medium** — **Fichier :** `NpsAutoPrompt.tsx:98-128` ; `NpsWidget.tsx:79-98`
- **Preuve :** backdrop `align-items:center` ; contenu `{ padding:32, maxWidth:520 }` SANS maxHeight ni overflowY ; contenu long (h2 28px + grille 0-10 + textarea + 2 boutons).
- **Fix :** `maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto'` ; `alignItems: 'flex-start'`. **Effort : S**

#### 5.4 Modals NPS/OnboardingTour sans scroll-lock du body → scroll bleed
- **Sévérité : medium** — **Fichier :** `NpsAutoPrompt.tsx`, `NpsWidget.tsx`, `OnboardingTour.tsx` (grep `body.style.overflow` = 0) ; cf. `FloatingHelpButton.tsx:60-62` qui le fait bien
- **Fix :** `useEffect` qui met `document.body.style.overflow='hidden'` à l'ouverture, restaure au close. Idéalement hook `useBodyScrollLock` partagé. **Effort : S**

#### 5.5 FAB « Besoin d'aide ? » chevauche le CTA de paiement (z-index 100, bottom-right)
- **Sévérité : medium** — **Fichier :** `FloatingHelpButton.tsx:108-136` ; monté sur tout `/order/*` via `order/layout.tsx:18` ; CTA `review/page.tsx:740-767`
- **Preuve :** FAB `position:fixed, bottom:24, right:24, zIndex:100` ~150px de large par-dessus le coin bas-droit du bouton « Confirmer la commande » width:100%.
- **Fix :** sur <700px, réduire à pastille icône (masquer le label), ou masquer sur review/paiement, + padding-bottom du `<main>` égal à la hauteur du FAB. **Effort : M**

#### 5.6 Grilles de stats admin figées à 2 colonnes (jamais 1) sous 375px
- **Sévérité : low** — **Fichier :** `migrated-pages.css:527, 588, 1397, 1567, 3507`
- **Preuve :** `.adm-quick`, `.ord-stats`, `.usr-stats`, `.ud-quickstats`, `.adm-health` s'arrêtent à `repeat(2,1fr)` (vs `.adm-stats`/`.adm-tpl-grid` qui atteignent 1fr).
- **Fix :** `@media (max-width:600px) { … { grid-template-columns: 1fr } }`. **Effort : S**

#### 5.7 `min-height: 100vh` partout (jamais `100dvh`) → saut/clipping iOS Safari
- **Sévérité : low** — **Fichier :** `globals.css:186` (`.shell`), `6397` (`.conf-shell`), `594` (`.recap`), + nombreux (grep `100dvh` = 0)
- **Preuve :** coquilles client en `100vh`. Sur iOS, la barre d'outils change la hauteur calculée → footer poussé hors-écran puis saut, `.recap` déborde de `calc(100vh-72px)`.
- **Fix :** `min-height: 100vh; min-height: 100svh` (fallback + override). **Effort : M** (large surface) / **S** pour les coquilles principales.

#### 5.8 Descriptions produit/option du wizard en 13px muted
- **Sévérité : low** — **Fichier :** `globals.css:1924` (`.pc-desc`), `2379` (`.tier-desc`), `4719` (`.stock-desc`)
- **Preuve :** corps de texte de décision (choix papier/produit/quantité) à 13px `--text-muted` (contraste AA OK, mais petit).
- **Fix :** 14-15px sur mobile pour ces 3 classes (garder les micro-labels mono/caps à 11-13px). **Effort : S**

---

## Gagnants rapides (effort S, impact élevé)

Ces items sont des correctifs de quelques lignes avec un retour immédiat sur le funnel ou le confort tactile :

| Item | Sévérité | Fichier |
|------|----------|---------|
| 5.2 Padding `.step-content` 64px→16px sur mobile (override après l.5956) | high | `globals.css:5956` |
| 3.1 Code promo `fontSize 13→16` (anti-zoom, page paiement) | medium | `review/page.tsx:892-901` |
| 3.7 `Field` shipping : forwarder `autoComplete`/`inputMode` | medium | `shipping/page.tsx:451-466` |
| 3.5 Recherche admin users/orders `13→16` | medium | `globals.css:11635, 10879` |
| 2.2 `.shell-footer` reflow mobile + masquer hint clavier | medium | `globals.css:267-284` |
| 4.2 Bouton « Retirer » panier : hit-area 44px | medium | `review/page.tsx:427-433` |
| 4.4 « × » modales : padding + 44px | medium | `CancelRequestButton.tsx:105` |

---

## ROADMAP par sprints

### Sprint 1 — Débloquer le funnel (quick wins fort impact)
*Objectif : plus aucun mobile bloqué ou désorienté sur le chemin d'argent.*

1. **1.1 — Sortir le paiement Stripe de `.recap`** (critical, M) — `review/page.tsx` + `globals.css:3931`. **À faire en premier, isolément.**
2. **5.2 — Override padding `.step-content` mobile** (high, S) — `globals.css:5956`
3. **2.1 + 2.2 — `.shell-footer` : safe-area + reflow mobile + masquer hint clavier** (medium, S+M) — `globals.css:267-284`
4. **3.1 — Code promo fontSize 16** (medium, S) — `review/page.tsx:892`
5. **3.2 — Textarea instructions livraison fontSize 16** (low, S) — `shipping/page.tsx:304`
6. **5.5 — FAB aide ne chevauche plus le bouton payer** (medium, M) — `FloatingHelpButton.tsx`

**Effort cumulé Sprint 1 : ~1 critical M + 1 high S + 3-4 S + 2 M ≈ 1,5–2 jours.**

### Sprint 2 — Confort tactile + formulaires
*Objectif : autofill, claviers, et cibles tactiles ≥44px sur tout le parcours client.*

1. **3.7 + 3.6 — `Field` shipping autoComplete/inputMode + code postal** (medium/low, S) — `shipping/page.tsx`
2. **3.3 + 3.4 — Inputs suivi commande + modals à 16px** (low/medium, S) — `TrackingForm.tsx`, `FloatingHelpButton.tsx`, `Nps*.tsx`
3. **3.5 — Inputs recherche admin à 16px (mobile)** (medium/low, S) — `globals.css`
4. **4.1 — Nav de compte mobile : drawer ou indicateur de scroll + cibles 44px** (high, M) — `Sidebar.tsx`, `globals.css:683`
5. **4.2 + 4.3 + 4.4 — Hit-areas « Retirer »/« × » à 44px** (medium/low, S) — review, modales
6. **4.6 + 4.8 — Finish-pills 44px + cellules NPS minmax 44px** (low, S)
7. **5.3 + 5.4 — Modals NPS : max-height/scroll + scroll-lock body** (medium, S)
8. **2.3 — Burger admin 44px + safe-area-top** (low, S)

**Effort cumulé Sprint 2 : 1 M + ~8 S ≈ 1,5–2 jours.**

### Sprint 3 — Polish typo / responsive / safe-area étendue
*Objectif : cohérence visuelle et robustesse sur tous les appareils.*

1. **5.7 — Migrer `100vh` → `100dvh`/`100svh` (fallback)** sur coquilles + `.recap` (low, M) — `globals.css`
2. **5.1 — Résumé prix LIVE compact en flux mobile (configurateur)** (low, M) — `ConfigureClient.tsx`
3. **5.6 — Grilles stats admin → 1 colonne <600px** (low, S) — `migrated-pages.css`
4. **5.8 — Descriptions produit 14-15px mobile** (low, S) — `globals.css`
5. **4.5 — Liens nav marketing : padding/row-gap** (low, S) — `migrated-pages.css:4255`
6. **4.7 — Ticks slider quantité : padding vertical** (low, M) — `globals.css:5162`
7. **Chantier transversal :** ajouter un utilitaire `.safe-bottom { padding-bottom: env(safe-area-inset-bottom) }` et l'appliquer à CookieConsent + tous les FAB (consolide le thème safe-area).

**Effort cumulé Sprint 3 : ~3 M + 3 S ≈ 1,5 jour.**

---

## Note d'honnêteté

Le mobile de Plio est **fonctionnellement correct à 95 %** : breakpoints présents, grilles qui collapsent, inputs principaux à 16px, zoom autorisé. Le seul vrai désastre est le **paiement masqué (1.1)** — un bug de réutilisation de classe, pas un défaut systémique. Les deux faiblesses transversales (safe-area absent malgré `viewportFit: cover` ; `100vh` partout) sont réelles mais cosmétiques/confort, pas bloquantes. La plupart des findings sont des `S` de polish. Pas de gonflage : sur 25 findings, **1 critical, 3 high**, le reste est medium/low.
