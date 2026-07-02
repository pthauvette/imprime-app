# Audit images produits + roadmap de prompts (2026-07)

> Audit multi-agents (8 agents) + synthèse. Objectif : passer de **zéro image produit** à un système de visuels cohérent, réaliste et fidèle à la charte Plio.

---

## 0. Verdict en une page

**Constat central : il n'y a aujourd'hui AUCUNE image produit.** `public/` est vide de raster, `VirtualProduct` n'a pas de champ image, Sinalite ne renvoie aucune image, et le catalogue se rend en **swatches CSS + typographie**. Ce n'est donc pas « améliorer » — c'est **créer un système de mockups là où il n'y en a pas**. Bonne nouvelle : aucune dette visuelle à défaire.

**Service recommandé (honnête, par cas d'usage — ne pas forcer un seul outil) :**

| Besoin | Outil socle | Pourquoi |
|--------|-------------|----------|
| **Stills de catalogue** (packshots cohérents, produit identique décliné) | **Google Nano Banana Pro** (Gemini 3 Pro Image) | Cohérence par référence multi-images (« lock » produit), réalisme matière, **texte lisible** (crucial pour une imprimerie) |
| **Verrouiller la charte** (réutilisable) + pictos/badges SVG | **Recraft V3/V4** | Custom Brand Style entraîné sur 3-5 réfs → palette identique reproductible ; sort du vrai vecteur |
| **Décliner en volume** une photo produit réelle (pipeline auto-hébergé) | **Flux.1 Kontext (dev)** | Édition en contexte, self-hostable, coûts maîtrisés |
| **Texte DANS l'image** (maquettes typographiées) | **Ideogram 3.0** ou Nano Banana | Les 2 seuls fiables à ~90 %+ |
| **Image hero one-shot** (esthétique max) | **Midjourney v7/v8** | Le plus beau, mais peu répétable → à normaliser ensuite |
| **MOTION / vidéo social** (Reels/TikTok, hero animé) | **Higgsfield** (Cinema Studio + Soul HEX) | **C'est LÀ sa vraie force.** Pas le socle des stills. |

> **Sur Higgsfield spécifiquement** (l'outil que tu as nommé) : excellent, mais **pas pour le cœur du besoin**. Sa force réelle = la **vidéo/motion cinématique** et les visuels lifestyle éditoriaux (avec **Soul HEX** pour imposer le warm off-white + vert sapin). Garde-le pour le **hero vidéo** et le **motion social** ; pour les *stills de catalogue* il est « moyen » (presets mode/lifestyle, pas packshot e-commerce neutre, cohérence produit-identique sous Nano Banana).

**Les 3 corrections à faire AVANT de générer** (issues de la critique adversariale) :
1. 🔴 **« Poster » n'existe pas** au catalogue → toute tuile promo « poster » = impasse de conversion. Aligner les grilles sur des entités réellement commandables.
2. 🔴 **Couvrir les 8 familles réelles** (3 étaient oubliées : accroche-portes, chemises de présentation, signets).
3. 🔴 **Alt-text déterministe obligatoire** (accessibilité + Loi 25 + SEO) — dérivé de la donnée produit, pas de la scène marketing.

---

## 1. Audit — état actuel

### 1.1 Il n'y a aucune image produit
- `public/` : **0 raster**. `next/image` : **non utilisé** (2 `<img>` bruts : avatar `UserMenu`, aperçu PDF `PdfMarginOverlay`).
- `VirtualProduct` (`src/lib/products/virtual-products.ts`) : champs `slug/name/eyebrow/lede/papers/variants` — **aucun champ image**.
- Sinalite (`SinaliteProduct`) : `id/sku/name/category/enabled` — **aucune image**. `ProductOverride` (admin) : pas d'image non plus.
- S3 sert **uniquement** les uploads client (PDF à imprimer), pas des visuels produit.

### 1.2 Où les visuels devraient apparaître (10 surfaces)

| Surface | Route | Ratio réel | Taille approx | Prio |
|---------|-------|-----------|---------------|------|
| Hero Product Cards | `/` | 7:4 | 900×500 | **P0** |
| Product Promo Grid | `/` | ~7:4 | 320×280/carte | **P0** |
| Paper Stock Swatches | `/order/v/[slug]` | 3:1 | 400×140 macro | **P0** |
| FinishPreview 3D | `/order/v/[slug]` | 7:4 | 280–320×210 | **P0** (Three.js déjà en place) |
| Category Icons Grid (8) | `/order/start` | 1:1 | 100×100 | P1 |
| Virtual Product Cards | `/order/product` | custom | 140px swatch | P1 |
| Order Review Cart Items | `/order/review` | 7:4 | 80×50 | P1 |
| Recap Mini Card | `/order/product` | 16:9 | 32×18 | P2 |
| Sample Swatches | `/samples` | custom | 140px | P2 |
| Compare Cards | `/compare` | custom | 220px | P2 |

> ⚠️ **Le start (`/order/start`) est DYNAMIQUE** (`groupProductsByFamily` depuis Sinalite) — le nombre de tuiles n'est pas figé à 8. Toute famille Sinalite hors des 8 curatées s'affiche quand même → **il FAUT un fallback** (voir §5).

### 1.3 Les 8 familles réelles (source : `virtual-products.ts`)

| Slug | Nom | Trim | Ratio packshot |
|------|-----|------|----------------|
| `cartes-de-visite` | Carte de visite | 3,5×2 po | 7:4 paysage |
| `cartes-postales` | Carte postale | 4×6 po | 3:2 paysage |
| `flyers` | Flyer | 8,5×11 po | 4:5 portrait |
| `cartes-de-voeux` | Carte de vœux | 8,5×5,5 (plié) | 4:5 portrait |
| `accroche-portes` | Accroche-porte | 8,5×3,5 po | 2:3 portrait allongé |
| `invitations` | Invitation | 5×7 po | 5:7 portrait |
| `chemises-presentation` | Chemise de présentation | 6×9 po | 4:5 portrait |
| `signets` | Signet | 2×8 po | 1:3 vertical extrême |

> ⚠️ **Ne PAS forcer tout en 7:4.** Un flyer 8,5×11, une invitation 5×7 ou un signet 2×8 forcés en paysage 7:4 seront **déformés**. Chaque famille = son ratio réel.

### 1.4 Intégration technique (résumé) — voir §6 pour le détail
- **Contrainte Amplify/Lambda** : timeout ~15 min → **génération on-demand côté serveur impossible**. → **Pré-générer** (build/seed), stocker S3, servir via CloudFront (statique).
- **CSP** `img-src 'self' data: https: blob:` → whitelister le domaine S3 si CDN externe.
- Pas de `sharp`, pas de `next/image`, pas de srcSet/AVIF/WebP → à ajouter (voir §6).

---

## 2. Le bloc de style de marque (à coller dans CHAQUE prompt)

> Coller ce bloc **à la fin** de chaque prompt image ci-dessous (référencé comme `[+ STYLE PLIO]`). C'est lui qui garantit la cohérence catalogue.

```
Style: premium eco-conscious print atelier aesthetic. Soft natural diffused daylight,
gentle directional light from upper left casting long soft shadows. Warm off-white paper
background (#FAFAF7) with a barely-perceptible paper grain texture. Restrained editorial
palette anchored by a single deep forest-green accent (#1F3D2B "vert sapin") against cream,
kraft and warm-white paper tones (#F5F1E8, #C9B89A); occasional metallic gold-foil highlight
(#D4AF37). Refined, calm, uncluttered composition with generous negative space and soft rounded
forms. Tactile premium materials: thick cotton cardstock, soft-touch matte and gloss finishes,
recycled kraft paper, subtle debossing. Multi-layered soft shadows tinted deep green-black,
never flat grey. Muted, sophisticated, luxe-yet-approachable mood — a quiet Québec creative
studio, artisanal and modern. High detail, photographic realism, shallow depth of field.
No harsh saturated colors, no pure white, no pure black, no busy backgrounds, no cheap
corporate stock-photo look.
```

**Palette (hex) :** canvas `#FAFAF7` · surface `#FFFFFF` · sunken `#F2F2EE` · **vert sapin `#1F3D2B`** (accent signature) · papier warm `#F5F1E8` · kraft `#C9B89A` · foil or `#D4AF37→#F4E5B1`. Jamais de blanc pur ni de noir pur.
**Fonts (pour overlays HTML, pas dans l'image) :** Instrument Serif (titres) · Inter (corps) · JetBrains Mono (labels/prix).
**Règle d'or texte-sur-mockup :** **jamais de mots réels lisibles** sur les produits — uniquement des marques abstraites / blocs / une petite marque verte. (Sinon : casse le fr-CA, fige un design daté, ment vs l'aperçu réel du client.)

---

## 3. Roadmap A — Packshots de CATALOGUE (le socle, 1 par famille)

> **Pipeline de production.** Outil : **Nano Banana Pro** (uploader une 1re image validée comme référence, puis décliner en gardant l'angle/lumière/fond identiques = cohérence catalogue). Fond studio neutre, pas lifestyle. Design abstrait/blanc. **Ces 8 alimentent : Hero, Promo Grid, Category Icons, Product Cards, Review thumbnails.**

**Convention :** générer d'abord `cat-01` (carte de visite) comme **image maître de référence**, puis passer les 7 autres avec cette image en référence pour verrouiller lumière + fond + traitement.

### cat-01 · Carte de visite — 7:4 paysage
```
Clean e-commerce catalog packshot of a small stack of 3.5 × 2 inch landscape business cards
on a warm off-white paper surface: four cards in a gentle 3D staggered fan, the top card
face-up showing a subtle soft-gloss finish with a faint diagonal light reflection, clean sharp
cut edges revealing a premium 16pt cardstock thickness, a single thin deep-forest-green printed
edge as the only accent. Abstract blank design, no readable text. Centered, catalog-consistent
studio angle, soft shadow beneath. [+ STYLE PLIO] 7:4 landscape.
```
**Éviter :** texte lisible ; blanc/noir purs ; plus de 4-5 cartes ; ombre grise plate ; déformer le 3,5×2.
**Notes :** image MAÎTRE de référence. Alimente Hero (`/`) + reprend le motif « stack-cards » de la charte.

### cat-02 · Carte postale — 3:2 paysage
```
Clean catalog packshot of a 4 × 6 inch landscape postcard resting flat on warm off-white paper
with a slight lift at one corner, a second postcard fanned behind showing its blank back, matte
14pt stock, clean cut edges, abstract minimal design with one small deep-forest-green shape,
no readable text. Same lighting and background as the reference. [+ STYLE PLIO] 3:2 landscape.
```
**Éviter :** texte lisible ; ratio faussé (garder 1:1.5) ; blanc pur.

### cat-03 · Flyer — 4:5 portrait
```
Clean catalog packshot of a single 8.5 × 11 inch portrait flyer standing upright with a soft
natural curl, one more flyer lying flat behind it, on a warm off-white surface; smooth 100lb
coated stock catching a soft window highlight; abstract minimal layout with faint green shapes,
no readable text. [+ STYLE PLIO] 4:5 portrait.
```
**Éviter :** blanc pur (le 100lb reste crème-warm) ; texte marketing ; clichés flat-lay (café/plante).

### cat-04 · Carte de vœux — 4:5 portrait
```
Clean catalog packshot of a folded greeting card (unfolded 8.5 × 5.5 inch, 14pt) standing
slightly open on warm off-white paper so the ~2mm fold thickness and clean inner crease are
visible; matte outer surface with a small deep-forest-green printed motif, warm cream writable
inner panel left blank; a recycled kraft envelope softly out of focus behind. No readable text.
[+ STYLE PLIO] 4:5 portrait.
```
**Éviter :** décor de Noël criard, rouge/vert clichés ; texte/calligraphie ; fausser l'épaisseur du pli.

### cat-05 · Accroche-porte — 2:3 portrait allongé
```
Clean catalog packshot of a single 8.5 × 3.5 inch door hanger with a clean die-cut hang hole
near the top, hanging from a simple brushed-brass door knob against a soft warm off-white wall,
rigid 14pt stock with a gentle gloss, abstract blank design with one thin deep-forest-green
strip, no readable text. Elongated vertical proportion (2.4:1), soft shadow on the wall.
[+ STYLE PLIO] 2:3 portrait.
```
**Éviter :** poignée moderne inox criarde ; texte « do not disturb » lisible ; ratio écrasé.

### cat-06 · Invitation — 5:7 portrait
```
Clean catalog packshot of a 5 × 7 inch invitation card lying at a slight angle on a deep-
forest-green (#1F3D2B) soft matte surface, warm cream stock with a selective metallic gold-foil
detail (#D4AF37) — a thin geometric line or small emblem — catching one soft directional
highlight and glinting against the matte paper; a pearl (nacré) swatch softly out of focus
beside it. Abstract elegant marks, no readable text. [+ STYLE PLIO] 5:7 portrait.
```
**Éviter :** foil orange/jaune plastique (viser `#D4AF37→#F4E5B1`) ; glitter/paillettes ; texte lisible.
**Notes :** le foil sur fond vert sapin = signature premium. Sert aussi de héros `/samples`.

### cat-07 · Chemise de présentation — 4:5 portrait
```
Clean catalog packshot of a 6 × 9 inch presentation folder, closed and standing at a slight
angle, with two or three blank cream sheets peeking from the inner pocket, rigid 14pt stock
with a smooth matte-lamination surface (soft near-velvet sheen), corporate-premium feel, a
single deep-forest-green accent on the cover, no readable text. [+ STYLE PLIO] 4:5 portrait.
```
**Éviter :** aspect classeur bureautique cheap ; logo/texte ; brillance plastique.

### cat-08 · Signet — 1:3 vertical extrême
```
Clean catalog packshot of a slim 2 × 8 inch vertical bookmark standing upright, premium 16pt
stock with a spot-UV glossy pattern shimmering over a matte surface, a small tassel optional at
the top, abstract vertical design with one deep-forest-green accent, no readable text; alternate
option: the bookmark slipped into a softly blurred open book. Extreme vertical proportion (1:4).
[+ STYLE PLIO] 1:3 vertical.
```
**Éviter :** ratio raccourci ; texte lisible ; spot-UV transformé en glitter.

> **Variantes finitions** (pour `FinishPreview` + `Paper Stock Swatches`, P0) : décliner cat-01 en macro par finition — `gloss` (reflet diagonal), `matte` (absorbe la lumière), `soft-touch` (velouté), `spot-uv` (motif brillant sélectif sur mat), `foil` (dorure `#D4AF37`), `kraft` (fibre brune recyclée), `pearl` (reflet nacré). 1 macro 3:1 par **substrat réel** (≈14 : `14pt/16pt/18pt/10pt/13pt` + `kraft/pearl/synthetic/linen/enviro/foil/ultrasmooth/100lb/80lb/70lb`). ⚠️ La liste canonique des substrats = `swatchClass()` dans `VirtualProductPicker.tsx`, **pas** une liste inventée.

---

## 4. Roadmap B — Hero / lifestyle / social / MOTION

> **Pipeline marketing** (évocateur, pas packshot). Stills → Nano Banana Pro / Midjourney. Motion → **Higgsfield Cinema Studio**. Tous avec `[+ STYLE PLIO]`.

### Stills (image fixe)
| id | Sujet | Ratio | Outil | Usage |
|----|-------|-------|-------|-------|
| `hero-01-atelier` | Vue d'atelier premium éco, tiers gauche vide pour le H1 | 16:9 (+21:9) | Nano Banana / Midjourney | Hero accueil `/` |
| `lifestyle-01-cartes-en-main` | Pile de cartes tenue en main, finitions visibles | 1:1 | Nano Banana | Preuve sociale `/`, `/order/start` |
| `lifestyle-02-flyers-table` | Flyers étalés, contraste couché vs recyclé | 16:9 (+4:5) | Nano Banana | Catégorie Flyers / bloc éco |
| `lifestyle-03-foil-invitation-macro` | Macro invitation foil sur fond vert sapin | 1:1 (+3:1) | Nano Banana / Recraft | Section finitions, `/samples` |
| `social-01-kraft-eco-story` | Carte Kraft debout, angle éco discret | 9:16 | Nano Banana | Story/Reel IG-TikTok |
| `social-02-stack-3d-feed` | Motif signature « stack-cards » flottant | 1:1 (+7:4) | Nano Banana / Recraft | Post feed + Hero site |
| `lifestyle-04-carte-voeux-pliee` | Carte de vœux pliée debout, saisonnier | 1:1 (+9:16) | Nano Banana | Saisonnier / catégorie vœux |

**Prompts complets (scène + `[+ STYLE PLIO]`) :** voir le fichier de sortie du workflow (les 7 scènes ci-dessus ont été générées avec le bloc de style embarqué). Exemple `hero-01` (scène) :
```
Wide editorial hero shot of a calm, premium eco-conscious print atelier in a quiet Québec
creative studio. A generous wooden worktable near a large window; on it, neat stacks of freshly
cut business cards, a few loose flyers, a folded greeting card and paper swatch fans (kraft,
cream, matte white) arranged with intentional negative space. Soft-focus background: a large-
format printer and shelves of paper reams. One small deep-forest-green (#1F3D2B) accent detail.
Ample empty warm off-white area on the LEFT THIRD for a headline overlay. [+ STYLE PLIO] 16:9.
```
**Éviter (transverse stills) :** texte/logo lisible (le titre = overlay HTML) ; mains déformées (vérifier l'anatomie) ; blanc/noir purs ; sourire stock-photo ; messaging éco militant ; watermark.

### Motion / vidéo — **Higgsfield Cinema Studio** (sa vraie force)
| id | Sujet | Ratio | Durée |
|----|-------|-------|-------|
| `motion-01-camera-glide-stack` | Caméra qui glisse le long d'une pile de cartes, finitions défilent | 16:9 (reframe 9:16) | 5–7 s, bouclable |
| `motion-02-falling-sheets` | Flyers/cartes qui tombent au ralenti, se posent | 9:16 (reframe 16:9) | 4–6 s ralenti |

Exemple `motion-01` :
```
MOTION/VIDÉO (5–7 s, boucle propre). Cinematic slow dolly-and-slide macro gliding smoothly along
the top edge of a neat stack of 3.5 × 2 inch premium business cards on a warm wooden atelier
table. Camera tracks left-to-right at a low grazing angle, shallow depth of field, each card
edge and finish drifting in/out of focus — a gloss reflection, then a matte edge, then a thin
deep-forest-green (#1F3D2B) strip glinting past. Soft window light upper-left, gentle dust motes,
almost no other movement — calm and premium. End on a settled frame for a headline overlay.
Smooth lateral slider, subtle parallax, NO shake, NO fast cuts, NO text. [+ STYLE PLIO] 16:9.
```
**Higgsfield spécifique :** utiliser **Soul HEX** pour imposer `#FAFAF7` + `#1F3D2B` depuis une image de référence. Livrer 16:9 (hero site) + reframe 9:16 (Reels). Prévoir une dernière frame stable pour l'overlay titre.

---

## 5. Écarts & garde-fous (critique adversariale)

**🔴 P0 — à corriger avant génération**
- **G2 « poster » = impasse.** `poster` n'existe pas dans `VIRTUAL_PRODUCTS`. Une tuile promo « poster » → 404/famille absente. Réaligner les grilles sur des entités commandables ; supprimer « poster » (ou ajouter la famille au catalogue d'abord).
- **G1 couverture 8/8.** Les prompts lifestyle ne touchaient que 4 familles → **cat-01…08 ci-dessus couvrent les 8** (dont accroche-portes, chemises, signets, oubliés).
- **G6 alt-text absent.** Générer un `alt` **déterministe** depuis la donnée produit : `"Carte de visite 16pt, finition soft-touch"`. Décoratifs (hero, stack-3D) → `alt=""` + `role="presentation"`.

**🟠 P1**
- **G4 matrice finition→3D.** Table `finish → {model, texturesPBR | fallback2D}` pour les ~15 finitions ; définir le rendu par défaut d'une finition « plate » (matte/standard).
- **G5 états vides.** Placeholder par défaut (SVG neutre 1:1 / 7:4 / 16:9) + règle « famille inconnue → icône générique » (le start est dynamique).
- **G7 texte-sur-mockup.** Placeholder graphique abstrait, **jamais de mots réels** (i18n fr-CA + fraîcheur + fidélité à l'aperçu client).
- **G8 cohérence inter-surfaces.** Un **kit de référence** (1 mockup maître par famille décliné aux 3-4 ratios), pas N images indépendantes → d'où la stratégie « image maître cat-01 + référence ».

**🟡 P2**
- **G9 ratios réels** (déjà corrigé au §1.3/§3) — ne pas tout mettre en 7:4.
- **G11 formats web.** « PNG 300dpi » = vocabulaire print inutile à l'écran. → **AVIF/WebP + fallback**, @1x/@2x, budget poids (hero < 150 Ko, thumb < 15 Ko). Motion : codec/durée/poster-frame.
- **G12 dose éco.** L'éco est une **minorité de specialty** au catalogue (best-sellers = 14pt/16pt couché). Ne pas sur-vendre « éco » visuellement vs le mix réel.

**Principe directeur : 2 pipelines séparés.**
1. **Production** (déterministe, 1-par-famille/substrat/finition, avec **fallback obligatoire** à chaque niveau : substrat sans photo → gradient CSS actuel ; finition sans 3D → 2D ; famille inconnue → icône générique). ← le §3.
2. **Marketing** (évocateur : hero/lifestyle/social/motion). ← le §4.
> **Livrable-gate : une matrice de couverture** (familles × substrats × finitions × surfaces×ratios) où chaque cellule = *asset réel | fallback nommé | N/A*. Rien ne ship tant qu'une cellule est vide.

---

## 6. Intégration technique — comment brancher les images

**Contrainte clé (Amplify/Lambda 15 min) :** génération on-demand serveur **impossible** → **pré-générer** (via l'outil IA hors ligne), stocker S3, servir CloudFront statique.

**Étapes :**
1. **Champs `VirtualProduct`** (non-breaking, optionnels) :
   ```ts
   imageUrl?: string;        // CDN/S3
   imageAlt?: string;        // déterministe (a11y — obligatoire à l'usage)
   imageLqip?: string;       // blur-up base64 (10×6, <1 Ko) → zéro CLS
   // et par combo si besoin : VirtualVariant.variantImageUrl?
   ```
2. **Stockage S3** : `product-images/{slug}/{paper}-{finish}-{ratio}.webp` (+ versionner l'URL pour le cache-bust : `.../v2/...`).
3. **CSP** (`next.config.ts`) : ajouter le domaine S3 à `img-src`.
4. **`next.config.ts images`** : `formats: ['image/avif','image/webp']`, `deviceSizes/imageSizes` — OU rester en `<img>` bruts + pré-générer tous les formats (`sharp` en build/seed) + `srcset`/`sizes` manuels + `loading="lazy"`/`decoding="async"` + `width`/`height` (anti-CLS).
5. **Composant** `ProductImage.tsx` (LQIP blur-up → image, `priority` pour le LCP hero).
6. **Seed** `scripts/seed-product-images.mjs` : upload S3 + génère les LQIP + peuple les champs.

**Risques à garder à l'œil :** CLS (toujours `width`/`height`), cache CloudFront ~24 h (versionner les URLs), poids (budget par surface), AVIF sur vieux Safari (fallback WebP/JPEG).

---

## 7. Séquence recommandée

1. **Décisions produit** (toi) : (a) garder UPS/FedEx-only côté visuel ? (b) supprimer/garder « poster » ? (c) offrir l'angle éco à quelle dose ?
2. **Générer l'image maître `cat-01`** (Nano Banana Pro) → valider la charte → l'utiliser comme référence pour `cat-02…08`.
3. **Décliner les 3-4 ratios** par famille (pour Hero/Grid/Icons/Review).
4. **Macros finitions/substrats** (P0 pour `/order/v/[slug]`).
5. **Hero + motion** (Nano Banana / Higgsfield) pour `/` et le social.
6. **Câbler** (§6) : champs + S3 + CSP + `ProductImage` + fallback + alt déterministe.
7. **Matrice de couverture** comme gate avant mise en prod.

*(Rapport généré par audit multi-agents Plio, 2026-07. Prompts catalogue §3 rédigés à la main après échec transitoire de l'agent dédié ; reste synthétisé du workflow.)*
