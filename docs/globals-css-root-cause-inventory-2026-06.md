# Inventaire cause racine `globals.css` — doublons de classes legacy (2026-06-28)

> Analyse **statique read-only** (indépendante de Neon / du preview). Transforme « cause
> racine ouverte » en plan d'action chiffré. Aucune édition appliquée par cet inventaire.

## TL;DR

- **Cause racine confirmée et quantifiée** : `src/styles/globals.css` (10 189 lignes) contient
  des **pages HTML legacy collées en double** → **99 règles EXACTEMENT dupliquées**
  (même sélecteur + même `@media` + déclarations byte-identiques) sur **2 032 règles**.
- **Aucun overflow mobile VIVANT** aujourd'hui : les casseurs connus (`auth-shell`, `two-col`,
  `adm-shell`, `footer-grid`) sont **patchés** (overrides EOF #375/#376, spécificité doublée
  #377) ou sains (collapse en dernier dans l'ordre source). Le risque est **latent** :
  bloat, fragilité (deux copies qui peuvent diverger silencieusement), règles mortes,
  précédence cross-file non évidente.
- **Remédiation Phase A sûre MAINTENANT** (sans runtime) : dédupliquer les 99 règles
  byte-identiques est **prouvablement neutre** sur le rendu (la dernière occurrence gagne =
  identique) → vérifiable par **diff de CSS résolu** (méthode déjà prouvée sur
  `migrated-pages.css`, `scripts/css-dedup-analysis.mjs`, 0 diff /3119 sélecteurs).

## 1. Cause racine : 3 blocs collés en double

Les 99 doublons exacts se regroupent en ~3 grands blocs collés deux fois (empreinte du
copier-coller de pages legacy) :

| Bloc | Plage A | Plage B (copie) | Classes représentatives |
|------|---------|-----------------|--------------------------|
| Design system / typographie | ~L150–450 | ~L5580–5775 | `t-display-xl`, `t-micro`, `t-caption`, `field`, `btn`, `btn-secondary`, `radio-card(.selected)`, `progress-segment` |
| Account shell | ~L620–735 | ~L4220–4604 | `acct-nav`, `acct-nav-link`, `acct-nav-section`, `acct-nav-brand`, `page-action`, `page-title` |
| Marketing / footer | ~L990–1640 | ~L8200–8700 | `mkt-brand`, `mkt-nav-cta`, `footer-grid`, `footer-col h4`, `footer-bottom`, `footer-brand-mark`, `hero-eyebrow(::before)` |

**Conséquence** : un correctif appliqué à UNE copie (ex. une cible tactile, une couleur)
ne touche pas l'autre → les deux divergent dans le temps. C'est la fragilité de fond.

## 2. Impact LAYOUT (la part qui a causé les overflows mobiles)

Sous-ensemble plus petit : des classes de **grille** dont une 2e définition multi-colonnes
(sans `@media`) écrase un collapse `@media`. État actuel **par classe** :

| Classe | Défs | État | Note |
|--------|------|------|------|
| `.auth-shell` | L1894 (@900→1fr) + **L10153 (EOF 1fr)** | ✅ patché #375 | override EOF force 1col |
| `.footer-grid` | L1610/L8678 (4col ×2) + @700→2col + **L10166 (EOF 1fr)** | ✅ patché #376 | dupliqué ET forcé 1col EOF |
| `.adm-shell` | L6037/@1024→1fr + **L10188 `.adm-shell.adm-shell` (1fr)** | ✅ patché #377 | spécificité doublée bat migrated-pages.css L75 |
| `.two-col` | — | ✅ résolu | absent de globals & migrated |
| `.field-row` | L2270 + L8793 (2col ×2) + @600→1col | ✅ sain | collapse en dernier ; dupliqué |
| `.stats-grid` | L8278 (2col, **morte**) + L8473 (4col) + @900→2col | ⚠️ règle morte | L8278 écrasée par L8473 |
| `.products-grid`/`.category-grid`/`.tpl-grid` | 3 défs (3→2→1col) | ✅ sain | collapse en dernier |

### Cross-file (migrated-pages.css importé APRÈS globals → gagne à spécificité égale)

| Classe | globals | migrated-pages | Verdict |
|--------|---------|----------------|---------|
| `.adm-shell` | collapse @1024 + EOF `.adm-shell.adm-shell` | L75 multi-col | ✅ patché (spécificité doublée) |
| `.order-header-card` | @900→1fr (**morte**) | L116 `1fr auto` + @700→1fr | ✅ mobile OK (collapse @700 couvre 375px), mais collapse globals @900 morte |
| `.tx-row` | L4488 `40px 1fr auto auto` | @640→`40px 1fr auto` | 🟡 jamais 1col ; 3col flexible à 375px (1fr absorbe) — risque faible, à MESURER |

## 3. Remédiation (par phases)

### Phase A — Déduplication byte-identique (SÛR maintenant, sans runtime)
- Retirer **les 99 règles exactement dupliquées** (garder la dernière occurrence de chaque).
- **Prouvablement neutre** : règles byte-identiques → la dernière gagne = même valeur calculée
  → la suppression de la copie antérieure ne change aucun gagnant de cascade.
- **Vérification sans Neon ni preview** : réutiliser la méthode `scripts/css-dedup-analysis.mjs`
  (CSS résolu par sélecteur, diff avant/après → exiger **0 diff**), exactement comme la dédup
  `migrated-pages.css` (#339). Gain : ~99 règles redondantes en moins, fin du risque de dérive.
- ⚠️ Le générateur `migrate-new-pages.mjs` est **mort/déprécié** (inputs disparus) — ne PAS
  le relancer (re-bloaterait). La dédup de globals se fait à la main, gardée par le diff résolu.

### Phase B — Consolidation des divergences + retrait des patches (NÉCESSITE runtime)
- Une fois Phase A faite, fusionner les défs divergentes (ex. `stats-grid` règle morte L8278 ;
  `order-header-card` collapse globals @900 morte) en UNE déf canonique, et retirer les overrides
  EOF (#375/#376) / spécificité doublée (#377) au profit d'une déf propre.
- ⚠️ Chaque retrait de patch ou fusion divergente **change potentiellement le rendu** → exige la
  mesure runtime d'overflow (`scripts/measure-overflow.mjs`, `scrollWidth` vs `clientWidth` à
  375px) sur les pages concernées. **Bloqué tant que Neon est down + preview peu fiable en
  largeur mobile** (cf. [[audit-mobile-uiux]]). À faire après rétablissement Neon.

## 4. Méthode & artefacts
- Parsers d'analyse (scratchpad, jetables) : suivi profondeur d'accolades + contexte `@media` +
  ordre source ; capture des règles complètes (sel+media+décls normalisées) pour les doublons exacts.
- Réutiliser pour la Phase A : `scripts/css-dedup-analysis.mjs` (diff CSS résolu, 0-diff = sûr).
- Réutiliser pour la Phase B : `scripts/measure-overflow.mjs` (mesure runtime 375px).
- Import order (cause de la précédence cross-file) : `app/layout.tsx` L3 globals **puis** L10
  migrated-pages → migrated gagne à spécificité égale.

## 5. Verdict
La cause racine est **réelle, quantifiée (99 doublons), mais actuellement INERTE** (symptômes
patchés). La Phase A (dédup byte-identique) est un gain sûr, chiffré et vérifiable sans Neon ;
la Phase B (vraie consolidation) attend le rétablissement Neon pour la vérification runtime.
Voir [[audit-mobile-uiux]] (rounds overflow #371-377) et [[css-dedup-resolved]] (méthode 0-diff).
