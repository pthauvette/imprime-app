/**
 * Produits VIRTUELS — couche d'abstraction Plio au-dessus du catalogue Sinalite.
 *
 * Sinalite modélise la FINITION comme un produit distinct : « Business Cards 14pt
 * + UV », « ... + Matte », « ... + AQ » sont 3 productId séparés (le SKU encode
 * papier+finition). Résultat : 25 produits « cartes de visite » quasi-identiques
 * dans le flow de commande.
 *
 * Ce module présente UN produit virtuel « Carte de visite » avec deux axes
 * (Papier × Finition) qui RÉSOLVENT vers le bon productId Sinalite. Le choix se
 * fait à l'étape de sélection produit ; le wizard de config (taille/qty/prix)
 * reçoit ensuite un productId normal — zéro changement en aval.
 *
 * Source : mapping curé depuis l'API Sinalite réelle (cf. scripts/sinalite-map.mjs,
 * store en_ca). À re-valider si Sinalite ajoute/retire des SKUs.
 */

export interface CardVariant {
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
export interface CardPaperMeta {
  key: string;
  label: string;
  desc: string;
  /** true = substrat specialty (Kraft, Perle…), regroupé après les standards. */
  specialty?: boolean;
}

export const CARD_PAPERS: CardPaperMeta[] = [
  { key: '14pt', label: '14pt — standard', desc: '350 g/m² · léger, économique, le best-seller.' },
  { key: '16pt', label: '16pt — premium', desc: '400 g/m² · plus épais, sensation pro.' },
  { key: '18pt', label: '18pt — lamination', desc: '450 g/m² · le plus rigide, finitions laminées.' },
  { key: 'kraft', label: 'Kraft', desc: '18pt 100 % recyclé, teinte brune naturelle.', specialty: true },
  { key: 'pearl', label: 'Perle (nacré)', desc: '14pt à reflet nacré.', specialty: true },
  { key: 'synthetic', label: 'Synthétique (durable)', desc: '16pt résistant à l\'eau et aux déchirures.', specialty: true },
  { key: 'linen', label: 'Lin', desc: '13pt texture lin, non couché.', specialty: true },
  { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
  { key: 'ultrasmooth', label: 'Ultra lisse', desc: '16pt surface ultra lisse.', specialty: true },
];

/**
 * Mapping curé papier × finition → productId Sinalite (store en_ca).
 * Les substrats specialty n'ont qu'une finition (« standard » du substrat).
 */
export const CARD_VARIANTS: CardVariant[] = [
  // 14pt
  { productId: 1,  paper: '14pt', finish: 'standard', finishLabel: 'Standard (sans couche)' },
  { productId: 2,  paper: '14pt', finish: 'aq',       finishLabel: 'AQ (glossy léger)' },
  { productId: 7,  paper: '14pt', finish: 'uv',       finishLabel: 'UV haute brillance' },
  { productId: 8,  paper: '14pt', finish: 'matte',    finishLabel: 'Mat' },
  { productId: 11, paper: '14pt', finish: 'writable-aq', finishLabel: 'Inscriptible + AQ', note: 'recto inscriptible au stylo' },
  { productId: 12, paper: '14pt', finish: 'writable-uv', finishLabel: 'Inscriptible + UV', note: 'recto inscriptible au stylo' },
  // 16pt
  { productId: 15, paper: '16pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
  { productId: 16, paper: '16pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
  { productId: 17, paper: '16pt', finish: 'matte', finishLabel: 'Mat' },
  { productId: 7567, paper: '16pt', finish: 'soft-touch', finishLabel: 'Soft touch (velours)' },
  // 18pt
  { productId: 9,  paper: '18pt', finish: 'matte-lam',  finishLabel: 'Lamination mate' },
  { productId: 10, paper: '18pt', finish: 'gloss-lam',  finishLabel: 'Lamination glossy' },
  { productId: 30, paper: '18pt', finish: 'spot-uv',    finishLabel: 'Mat + Spot UV', note: 'vernis sélectif brillant' },
  { productId: 5557, paper: '18pt', finish: 'writable', finishLabel: 'Inscriptible (C1S)', note: 'recto inscriptible' },
  // specialty substrates (une finition « standard » chacun)
  { productId: 7332,  paper: 'kraft',      finish: 'standard', finishLabel: 'Kraft naturel' },
  { productId: 7334,  paper: 'pearl',      finish: 'standard', finishLabel: 'Perle nacré' },
  { productId: 7326,  paper: 'synthetic',  finish: 'standard', finishLabel: 'Synthétique durable' },
  { productId: 31,    paper: 'linen',      finish: 'standard', finishLabel: 'Lin non couché' },
  { productId: 13,    paper: 'enviro',     finish: 'standard', finishLabel: 'Recyclé non couché' },
  { productId: 15022, paper: 'ultrasmooth', finish: 'standard', finishLabel: 'Ultra lisse' },
];

/** Papiers disponibles, dans l'ordre (standards puis specialty). */
export function cardPapers(): CardPaperMeta[] {
  const present = new Set(CARD_VARIANTS.map((v) => v.paper));
  return CARD_PAPERS.filter((p) => present.has(p.key));
}

/** Finitions disponibles pour un papier donné. */
export function cardFinishes(paper: string): CardVariant[] {
  return CARD_VARIANTS.filter((v) => v.paper === paper);
}

/** Résout (papier, finition) → productId Sinalite, ou null. */
export function resolveCardProductId(paper: string, finish: string): number | null {
  return CARD_VARIANTS.find((v) => v.paper === paper && v.finish === finish)?.productId ?? null;
}
