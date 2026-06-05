/**
 * Produits VIRTUELS — couche d'abstraction Plio au-dessus du catalogue Sinalite.
 *
 * Sinalite modélise la FINITION comme un produit distinct : « Postcards 14pt + UV »,
 * « ... + Matte », « ... + AQ » sont des productId séparés (le SKU encode
 * papier+finition). Résultat : 19-25 produits quasi-identiques par form-factor.
 *
 * Ce module présente UN produit virtuel par form-factor (carte de visite, carte
 * postale, …) avec deux axes (Papier × Finition) qui RÉSOLVENT vers le bon
 * productId Sinalite. Le choix se fait à l'étape de sélection produit ; le wizard
 * de config (taille/qty/prix) reçoit ensuite un productId normal — zéro changement
 * en aval.
 *
 * Mapping curé depuis l'API Sinalite réelle (cf. scripts/sinalite-map.mjs, store
 * en_ca). On groupe par SUBSTRAT RÉEL (Stock/SKU), pas par le nom marketing qui
 * ment parfois (ex. « 18PT Matte Lam » dont le Stock réel est 16PT). À re-valider
 * si Sinalite ajoute/retire des SKUs.
 */

export interface VirtualVariant {
  /** productId Sinalite résolu pour ce couple papier × finition. */
  productId: number;
  /** Clé de papier (axe 1). */
  paper: string;
  /** Clé de finition (axe 2), unique au sein d'un papier. */
  finish: string;
  /** Libellé court de finition affiché à l'utilisateur. */
  finishLabel: string;
  /** Sous-texte optionnel (specialty, inscriptible, etc.). */
  note?: string;
}

/** Métadonnées d'affichage par papier (ordre + libellé + desc). */
export interface VirtualPaper {
  key: string;
  label: string;
  desc: string;
  /** true = substrat specialty (Kraft, Perle…), regroupé après les standards. */
  specialty?: boolean;
}

export interface VirtualProduct {
  /** Slug d'URL (/order/v/<slug>) + lien depuis le start. */
  slug: string;
  /** Nom affiché — ex. « Carte de visite ». */
  name: string;
  /** Numéro d'étape (le wizard a 6 étapes ; le picker est l'étape 02). */
  eyebrow: string;
  /** Phrase d'accroche sous le titre. */
  lede: string;
  /** Papiers disponibles, dans l'ordre (standards puis specialty). */
  papers: VirtualPaper[];
  /** Mapping papier × finition → productId. */
  variants: VirtualVariant[];
}

// ─── Cartes de visite ───────────────────────────────────────────────────────
const CARTES_DE_VISITE: VirtualProduct = {
  slug: 'cartes-de-visite',
  name: 'Carte de visite',
  eyebrow: 'Étape 02 — Carte de visite',
  lede: 'On a regroupé toutes les cartes en un seul produit — pas besoin de chercher parmi 25 variantes.',
  papers: [
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · léger, économique, le best-seller.' },
    { key: '16pt', label: '16pt — premium', desc: '400 g/m² · plus épais, sensation pro.' },
    { key: '18pt', label: '18pt — lamination', desc: '450 g/m² · le plus rigide, finitions laminées.' },
    { key: 'kraft', label: 'Kraft', desc: '18pt 100 % recyclé, teinte brune naturelle.', specialty: true },
    { key: 'pearl', label: 'Perle (nacré)', desc: '14pt à reflet nacré.', specialty: true },
    { key: 'synthetic', label: 'Synthétique (durable)', desc: '16pt résistant à l\'eau et aux déchirures.', specialty: true },
    { key: 'linen', label: 'Lin', desc: '13pt texture lin, non couché.', specialty: true },
    { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
    { key: 'ultrasmooth', label: 'Ultra lisse', desc: '16pt surface ultra lisse.', specialty: true },
  ],
  variants: [
    { productId: 1,  paper: '14pt', finish: 'standard', finishLabel: 'Standard (sans couche)' },
    { productId: 2,  paper: '14pt', finish: 'aq',       finishLabel: 'AQ (glossy léger)' },
    { productId: 7,  paper: '14pt', finish: 'uv',       finishLabel: 'UV haute brillance' },
    { productId: 8,  paper: '14pt', finish: 'matte',    finishLabel: 'Mat' },
    { productId: 11, paper: '14pt', finish: 'writable-aq', finishLabel: 'Inscriptible + AQ', note: 'recto inscriptible au stylo' },
    { productId: 12, paper: '14pt', finish: 'writable-uv', finishLabel: 'Inscriptible + UV', note: 'recto inscriptible au stylo' },
    { productId: 15, paper: '16pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
    { productId: 16, paper: '16pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 17, paper: '16pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 7567, paper: '16pt', finish: 'soft-touch', finishLabel: 'Soft touch (velours)' },
    { productId: 9,  paper: '18pt', finish: 'matte-lam',  finishLabel: 'Lamination mate' },
    { productId: 10, paper: '18pt', finish: 'gloss-lam',  finishLabel: 'Lamination glossy' },
    { productId: 30, paper: '18pt', finish: 'spot-uv',    finishLabel: 'Mat + Spot UV', note: 'vernis sélectif brillant' },
    { productId: 5557, paper: '18pt', finish: 'writable', finishLabel: 'Inscriptible (C1S)', note: 'recto inscriptible' },
    { productId: 7332,  paper: 'kraft',      finish: 'standard', finishLabel: 'Kraft naturel' },
    { productId: 7334,  paper: 'pearl',      finish: 'standard', finishLabel: 'Perle nacré' },
    { productId: 7326,  paper: 'synthetic',  finish: 'standard', finishLabel: 'Synthétique durable' },
    { productId: 31,    paper: 'linen',      finish: 'standard', finishLabel: 'Lin non couché' },
    { productId: 13,    paper: 'enviro',     finish: 'standard', finishLabel: 'Recyclé non couché' },
    { productId: 15022, paper: 'ultrasmooth', finish: 'standard', finishLabel: 'Ultra lisse' },
  ],
};

// ─── Cartes postales ────────────────────────────────────────────────────────
// Groupées par substrat RÉEL (Stock) : les « 18PT » Sinalite sont en fait 16PT.
const CARTES_POSTALES: VirtualProduct = {
  slug: 'cartes-postales',
  name: 'Carte postale',
  eyebrow: 'Étape 02 — Carte postale',
  lede: 'Toutes les cartes postales en un seul produit — choisis le papier puis la finition.',
  papers: [
    { key: '10pt', label: '10pt — léger', desc: '250 g/m² · économique pour gros tirages.' },
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · le polyvalent.' },
    { key: '16pt', label: '16pt — premium', desc: '400 g/m² · plus épais, finitions laminées dispo.' },
    { key: 'kraft', label: 'Kraft', desc: '18pt recyclé, teinte naturelle.', specialty: true },
    { key: 'pearl', label: 'Perle (nacré)', desc: '14pt à reflet nacré.', specialty: true },
    { key: 'synthetic', label: 'Synthétique (durable)', desc: '16pt résistant à l\'eau.', specialty: true },
    { key: 'linen', label: 'Lin', desc: '13pt texture lin, non couché.', specialty: true },
    { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
    { key: 'foil', label: 'Foil métallique', desc: '16pt avec dorure métallique.', specialty: true },
  ],
  variants: [
    { productId: 26,   paper: '10pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
    { productId: 4904, paper: '10pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 18, paper: '14pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
    { productId: 20, paper: '14pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 23, paper: '14pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 27, paper: '14pt', finish: 'writable-aq', finishLabel: 'Inscriptible + AQ', note: 'recto inscriptible' },
    { productId: 28, paper: '14pt', finish: 'writable-uv', finishLabel: 'Inscriptible + UV', note: 'recto inscriptible' },
    { productId: 32,  paper: '16pt', finish: 'aq',        finishLabel: 'AQ (glossy léger)' },
    { productId: 33,  paper: '16pt', finish: 'uv',        finishLabel: 'UV haute brillance' },
    { productId: 34,  paper: '16pt', finish: 'matte',     finishLabel: 'Mat' },
    { productId: 24,  paper: '16pt', finish: 'matte-lam', finishLabel: 'Lamination mate' },
    { productId: 25,  paper: '16pt', finish: 'gloss-lam', finishLabel: 'Lamination glossy' },
    { productId: 163, paper: '16pt', finish: 'spot-uv',   finishLabel: 'Mat + Spot UV', note: 'vernis sélectif brillant' },
    { productId: 7544, paper: 'kraft',     finish: 'standard', finishLabel: 'Kraft naturel' },
    { productId: 7543, paper: 'pearl',     finish: 'standard', finishLabel: 'Perle nacré' },
    { productId: 7546, paper: 'synthetic', finish: 'standard', finishLabel: 'Synthétique durable' },
    { productId: 35,   paper: 'linen',     finish: 'standard', finishLabel: 'Lin non couché' },
    { productId: 29,   paper: 'enviro',    finish: 'standard', finishLabel: 'Recyclé non couché' },
    { productId: 7545, paper: 'foil',      finish: 'standard', finishLabel: 'Foil métallique' },
  ],
};

/** Registre des produits virtuels, par slug. */
export const VIRTUAL_PRODUCTS: Record<string, VirtualProduct> = {
  [CARTES_DE_VISITE.slug]: CARTES_DE_VISITE,
  [CARTES_POSTALES.slug]: CARTES_POSTALES,
};

/** Slugs qui ont un produit virtuel (pour wirer les tuiles du start). */
export const VIRTUAL_PRODUCT_SLUGS = new Set(Object.keys(VIRTUAL_PRODUCTS));

export function getVirtualProduct(slug: string): VirtualProduct | undefined {
  return VIRTUAL_PRODUCTS[slug];
}

/** Papiers disponibles d'un produit virtuel (ceux qui ont ≥ 1 variant). */
export function virtualPapers(slug: string): VirtualPaper[] {
  const vp = VIRTUAL_PRODUCTS[slug];
  if (!vp) return [];
  const present = new Set(vp.variants.map((v) => v.paper));
  return vp.papers.filter((p) => present.has(p.key));
}

/** Finitions disponibles pour un papier donné d'un produit virtuel. */
export function virtualFinishes(slug: string, paper: string): VirtualVariant[] {
  const vp = VIRTUAL_PRODUCTS[slug];
  if (!vp) return [];
  return vp.variants.filter((v) => v.paper === paper);
}

/** Résout (slug, papier, finition) → productId Sinalite, ou null. */
export function resolveVirtualProductId(slug: string, paper: string, finish: string): number | null {
  return VIRTUAL_PRODUCTS[slug]?.variants.find((v) => v.paper === paper && v.finish === finish)?.productId ?? null;
}
