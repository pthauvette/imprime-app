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
  /** productId Sinalite résolu pour ce couple axe1 × axe2. */
  productId: number;
  /** Clé de papier (axe 1). */
  paper: string;
  /** Clé du 2e axe (finition PAR DÉFAUT ; format si `axis2Kind: 'format'`),
   *  unique au sein d'un papier. */
  finish: string;
  /** Libellé court du 2e axe affiché à l'utilisateur. */
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
  /** Mapping axe1 × axe2 → productId. */
  variants: VirtualVariant[];
  /**
   * Nature du 2e axe. Défaut `'finish'` (couche : UV/Mat/…). `'format'` quand
   * les productId d'un même produit diffèrent par la DIMENSION plutôt que la
   * finition (ex. livrets : 5 papiers × 2 formats). Pilote le libellé du picker
   * et exclut le 2e axe du contrôle « chaque finition a un matériau ».
   */
  axis2Kind?: 'finish' | 'format';
  /** Libellé singulier du 2e axe (défaut « Finition »). Ex. « Format ». */
  axis2Label?: string;
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

// ─── Flyers ─────────────────────────────────────────────────────────────────
const FLYERS: VirtualProduct = {
  slug: 'flyers',
  name: 'Flyer',
  eyebrow: 'Étape 02 — Flyer',
  lede: 'Tous les flyers en un seul produit — choisis le papier puis la finition.',
  papers: [
    { key: '100lb', label: '100lb couché', desc: 'Texte couché brillant · le standard polyvalent.' },
    { key: 'enviro', label: 'Recyclé 80lb', desc: 'Non couché, éco.', specialty: true },
    { key: 'linen', label: 'Lin 70lb', desc: 'Texture lin, non couché.', specialty: true },
  ],
  variants: [
    { productId: 37, paper: '100lb', finish: 'standard', finishLabel: 'Sans couche' },
    { productId: 38, paper: '100lb', finish: 'uv',       finishLabel: 'UV haute brillance' },
    { productId: 39, paper: '100lb', finish: 'matte',    finishLabel: 'Mat' },
    { productId: 40, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
    { productId: 41, paper: 'linen',  finish: 'standard', finishLabel: 'Lin non couché' },
  ],
};

// ─── Cartes de vœux ─────────────────────────────────────────────────────────
const CARTES_DE_VOEUX: VirtualProduct = {
  slug: 'cartes-de-voeux',
  name: 'Carte de vœux',
  eyebrow: 'Étape 02 — Carte de vœux',
  lede: 'Toutes les cartes de vœux en un seul produit — papier puis finition.',
  papers: [
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · le polyvalent.' },
    { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
  ],
  variants: [
    { productId: 48, paper: '14pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
    { productId: 49, paper: '14pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 50, paper: '14pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 51, paper: '14pt', finish: 'writable-aq', finishLabel: 'Inscriptible + AQ', note: 'intérieur inscriptible' },
    { productId: 52, paper: '14pt', finish: 'writable-uv', finishLabel: 'Inscriptible + UV', note: 'intérieur inscriptible' },
    { productId: 53, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
  ],
};

// ─── Accroche-portes ────────────────────────────────────────────────────────
const ACCROCHE_PORTES: VirtualProduct = {
  slug: 'accroche-portes',
  name: 'Accroche-porte',
  eyebrow: 'Étape 02 — Accroche-porte',
  lede: 'Tous les accroche-portes en un seul produit — papier puis finition.',
  papers: [
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · rigide, le standard.' },
    { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
  ],
  variants: [
    { productId: 69, paper: '14pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
    { productId: 70, paper: '14pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 71, paper: '14pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 72, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
  ],
};

// ─── Invitations ────────────────────────────────────────────────────────────
const INVITATIONS: VirtualProduct = {
  slug: 'invitations',
  name: 'Invitation',
  eyebrow: 'Étape 02 — Invitation',
  lede: 'Toutes les invitations en un seul produit — papier puis finition.',
  papers: [
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · le polyvalent.' },
    { key: 'pearl', label: 'Perle (nacré)', desc: 'Reflet nacré élégant.', specialty: true },
    { key: 'foil', label: 'Foil métallique', desc: 'Dorure métallique.', specialty: true },
  ],
  variants: [
    { productId: 15007, paper: '14pt', finish: 'aq',    finishLabel: 'AQ (glossy léger)' },
    { productId: 15008, paper: '14pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 15005, paper: '14pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 15006, paper: '14pt', finish: 'writable-aq', finishLabel: 'Inscriptible + AQ', note: 'inscriptible' },
    { productId: 15010, paper: 'pearl', finish: 'standard', finishLabel: 'Perle nacré' },
    { productId: 15011, paper: 'foil',  finish: 'standard', finishLabel: 'Foil métallique' },
  ],
};

// ─── Chemises de présentation ───────────────────────────────────────────────
const CHEMISES: VirtualProduct = {
  slug: 'chemises-presentation',
  name: 'Chemise de présentation',
  eyebrow: 'Étape 02 — Chemise de présentation',
  lede: 'Toutes les chemises (pochettes) en un seul produit — finition au choix.',
  papers: [
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · rigide, pochette pro.' },
  ],
  variants: [
    { productId: 58, paper: '14pt', finish: 'aq',        finishLabel: 'AQ (glossy léger)' },
    { productId: 59, paper: '14pt', finish: 'matte',     finishLabel: 'Mat' },
    { productId: 60, paper: '14pt', finish: 'uv',        finishLabel: 'UV haute brillance' },
    { productId: 4137, paper: '14pt', finish: 'matte-lam', finishLabel: 'Lamination mate' },
  ],
};

// ─── Signets (bookmarks) ────────────────────────────────────────────────────
const SIGNETS: VirtualProduct = {
  slug: 'signets',
  name: 'Signet',
  eyebrow: 'Étape 02 — Signet',
  lede: 'Tous les signets (marque-pages) en un seul produit — papier puis finition.',
  papers: [
    { key: '10pt', label: '10pt — léger', desc: '250 g/m² · économique.' },
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · le polyvalent.' },
    { key: '16pt', label: '16pt — premium', desc: '400 g/m² · plus épais, laminations dispo.' },
    { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
    { key: 'linen', label: 'Lin', desc: '13pt texture lin, non couché.', specialty: true },
  ],
  variants: [
    { productId: 5541, paper: '10pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 5528, paper: '14pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 5529, paper: '14pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 5534, paper: '14pt', finish: 'writable-uv', finishLabel: 'Inscriptible + UV', note: 'recto inscriptible' },
    { productId: 5537, paper: '16pt', finish: 'uv',    finishLabel: 'UV haute brillance' },
    { productId: 5538, paper: '16pt', finish: 'matte', finishLabel: 'Mat' },
    { productId: 5530, paper: '16pt', finish: 'matte-lam', finishLabel: 'Lamination mate' },
    { productId: 5531, paper: '16pt', finish: 'gloss-lam', finishLabel: 'Lamination glossy' },
    { productId: 5546, paper: '16pt', finish: 'spot-uv', finishLabel: 'Mat + Spot UV', note: 'vernis sélectif' },
    { productId: 5535, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
    { productId: 5539, paper: 'linen',  finish: 'standard', finishLabel: 'Lin non couché' },
  ],
};

// ─── Brochures ──────────────────────────────────────────────────────────────
// Famille « brochures » (list-based) : les 4 productId ne diffèrent QUE par la
// couche (Sinalite les modélise en produits séparés). Slug ≠ family slug
// `brochures` — sinon /order/start routerait la famille vers /order/v.
const BROCHURE: VirtualProduct = {
  slug: 'brochure',
  name: 'Brochure',
  eyebrow: 'Étape 02 — Brochure',
  lede: 'Toutes les brochures en un seul produit — choisis le papier puis la finition. Le type de pli se choisit à la configuration.',
  papers: [
    { key: '100lb', label: '100lb couché', desc: 'Texte couché · le standard polyvalent.' },
    { key: 'enviro', label: 'Recyclé 80lb', desc: 'Non couché, éco.', specialty: true },
  ],
  variants: [
    { productId: 43, paper: '100lb', finish: 'standard', finishLabel: 'Sans couche' },
    { productId: 44, paper: '100lb', finish: 'uv',       finishLabel: 'UV haute brillance' },
    { productId: 45, paper: '100lb', finish: 'matte',    finishLabel: 'Mat' },
    { productId: 46, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
  ],
};

// ─── Cartes détachables (Tear Cards) ────────────────────────────────────────
const CARTES_DETACHABLES: VirtualProduct = {
  slug: 'cartes-detachables',
  name: 'Carte détachable',
  eyebrow: 'Étape 02 — Carte détachable',
  lede: 'Toutes les cartes détachables (tear cards, avec perforation) en un seul produit — papier puis finition.',
  papers: [
    { key: '14pt', label: '14pt — standard', desc: '350 g/m² · rigide, le standard.' },
    { key: 'enviro', label: 'Recyclé (enviro)', desc: '13pt non couché, éco.', specialty: true },
  ],
  variants: [
    { productId: 129, paper: '14pt',  finish: 'uv',       finishLabel: 'UV haute brillance' },
    { productId: 130, paper: '14pt',  finish: 'matte',    finishLabel: 'Mat' },
    { productId: 132, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
  ],
};

// ─── Affiches (Posters papier) ──────────────────────────────────────────────
// Famille « bannieres » (list-based). ≠ affiches RIGIDES (coroplaste/foam) qui
// restent des produits distincts (substrats réels différents).
const AFFICHES: VirtualProduct = {
  slug: 'affiches',
  name: 'Affiche',
  eyebrow: 'Étape 02 — Affiche',
  lede: 'Toutes les affiches papier grand format en un seul produit — papier puis finition.',
  papers: [
    { key: '100lb', label: '100lb couché', desc: 'Texte couché · rendu photo éclatant.' },
    { key: 'enviro', label: 'Recyclé 80lb', desc: 'Non couché, éco.', specialty: true },
  ],
  variants: [
    { productId: 65, paper: '100lb', finish: 'standard', finishLabel: 'Sans couche' },
    { productId: 66, paper: '100lb', finish: 'matte',    finishLabel: 'Mat' },
    { productId: 67, paper: '100lb', finish: 'uv',       finishLabel: 'UV haute brillance' },
    { productId: 68, paper: 'enviro', finish: 'standard', finishLabel: 'Recyclé non couché' },
  ],
};

// ─── Feuilles numériques (Digital Sheets 12×18) ─────────────────────────────
// Deux stocks « enviro » de grammages DIFFÉRENTS (13pt carte vs 80lb texte) →
// clés papier distinctes, sinon doublon (papier, finition).
const FEUILLES_NUMERIQUES: VirtualProduct = {
  slug: 'feuilles-numeriques',
  name: 'Feuille numérique',
  eyebrow: 'Étape 02 — Feuille numérique',
  lede: 'Toutes les feuilles numériques (12 × 18) en un seul produit — papier puis finition.',
  papers: [
    { key: '14pt',       label: '14pt carte', desc: '350 g/m² · carte rigide.' },
    { key: '100lb',      label: '100lb couché', desc: 'Texte couché brillant.' },
    { key: 'enviro-13pt', label: 'Recyclé 13pt', desc: 'Carte recyclée non couchée.', specialty: true },
    { key: 'enviro-80lb', label: 'Recyclé 80lb', desc: 'Texte recyclé non couché.', specialty: true },
  ],
  variants: [
    { productId: 137, paper: '14pt',        finish: 'matte',    finishLabel: 'Mat' },
    { productId: 139, paper: '100lb',       finish: 'standard', finishLabel: 'Sans couche' },
    { productId: 141, paper: '100lb',       finish: 'matte',    finishLabel: 'Mat' },
    { productId: 138, paper: 'enviro-13pt', finish: 'standard', finishLabel: 'Recyclé non couché' },
    { productId: 142, paper: 'enviro-80lb', finish: 'standard', finishLabel: 'Recyclé non couché' },
  ],
};

// ─── Livrets (Booklets) — 2e axe = FORMAT, pas finition ─────────────────────
// Les 10 productId Booklets = 5 papiers × 2 formats. La « size » Sinalite est le
// NOMBRE DE PAGES (8→64pg, choisi à la config) ; la dimension physique
// (8,5×5,5 / 8,5×11) est encodée dans le productId → axe FORMAT. Slug `livrets`
// (≠ family slug `brochures`) réutilise la margin-spec `livrets` existante.
const LIVRETS: VirtualProduct = {
  slug: 'livrets',
  name: 'Livret',
  eyebrow: 'Étape 02 — Livret',
  lede: 'Tous les livrets (booklets) en un seul produit — choisis le papier puis le format. Le nombre de pages et la reliure se choisissent à la configuration.',
  axis2Kind: 'format',
  axis2Label: 'Format',
  papers: [
    { key: '60lb-offset', label: '60lb Offset — économique', desc: 'Texte non couché, léger et économique.' },
    { key: '80lb-gloss',  label: '80lb Gloss — standard', desc: 'Texte couché brillant · le polyvalent.' },
    { key: '100lb-gloss', label: '100lb Gloss — premium', desc: 'Plus épais, couché brillant.' },
    { key: '80lb-silk',   label: '80lb Silk — satiné', desc: 'Texte couché satiné (silk), reflets doux.' },
    { key: '100lb-silk',  label: '100lb Silk — premium satiné', desc: 'Épais, couché satiné haut de gamme.' },
  ],
  variants: [
    { productId: 14679, paper: '60lb-offset', finish: 'half-letter', finishLabel: '8,5 × 5,5 po (demi-lettre)' },
    { productId: 14678, paper: '60lb-offset', finish: 'letter',      finishLabel: '8,5 × 11 po (lettre)' },
    { productId: 54,    paper: '80lb-gloss',  finish: 'half-letter', finishLabel: '8,5 × 5,5 po (demi-lettre)' },
    { productId: 55,    paper: '80lb-gloss',  finish: 'letter',      finishLabel: '8,5 × 11 po (lettre)' },
    { productId: 56,    paper: '100lb-gloss', finish: 'half-letter', finishLabel: '8,5 × 5,5 po (demi-lettre)' },
    { productId: 57,    paper: '100lb-gloss', finish: 'letter',      finishLabel: '8,5 × 11 po (lettre)' },
    { productId: 14979, paper: '80lb-silk',   finish: 'half-letter', finishLabel: '8,5 × 5,5 po (demi-lettre)' },
    { productId: 14980, paper: '80lb-silk',   finish: 'letter',      finishLabel: '8,5 × 11 po (lettre)' },
    { productId: 14982, paper: '100lb-silk',  finish: 'half-letter', finishLabel: '8,5 × 5,5 po (demi-lettre)' },
    { productId: 14983, paper: '100lb-silk',  finish: 'letter',      finishLabel: '8,5 × 11 po (lettre)' },
  ],
};

/** Registre des produits virtuels, par slug. */
export const VIRTUAL_PRODUCTS: Record<string, VirtualProduct> = {
  [CARTES_DE_VISITE.slug]: CARTES_DE_VISITE,
  [CARTES_POSTALES.slug]: CARTES_POSTALES,
  [FLYERS.slug]: FLYERS,
  [CARTES_DE_VOEUX.slug]: CARTES_DE_VOEUX,
  [ACCROCHE_PORTES.slug]: ACCROCHE_PORTES,
  [INVITATIONS.slug]: INVITATIONS,
  [CHEMISES.slug]: CHEMISES,
  [SIGNETS.slug]: SIGNETS,
  [BROCHURE.slug]: BROCHURE,
  [CARTES_DETACHABLES.slug]: CARTES_DETACHABLES,
  [AFFICHES.slug]: AFFICHES,
  [FEUILLES_NUMERIQUES.slug]: FEUILLES_NUMERIQUES,
  [LIVRETS.slug]: LIVRETS,
};

/** Slugs qui ont un produit virtuel (pour wirer les tuiles du start). */
export const VIRTUAL_PRODUCT_SLUGS = new Set(Object.keys(VIRTUAL_PRODUCTS));

export function getVirtualProduct(slug: string): VirtualProduct | undefined {
  return VIRTUAL_PRODUCTS[slug];
}

/**
 * Papiers disponibles d'un produit virtuel (ceux qui ont ≥ 1 variant).
 * Audit v3 L1 — si `allowed` est fourni (productId réellement actifs côté
 * Sinalite + overrides admin), on ne garde que les papiers ayant ≥ 1 variant
 * ACTIF, pour ne pas proposer un papier/finition désactivé (rejeté au paiement).
 */
export function virtualPapers(slug: string, allowed?: ReadonlySet<number>): VirtualPaper[] {
  const vp = VIRTUAL_PRODUCTS[slug];
  if (!vp) return [];
  const present = new Set(
    vp.variants.filter((v) => !allowed || allowed.has(v.productId)).map((v) => v.paper),
  );
  return vp.papers.filter((p) => present.has(p.key));
}

/** Finitions disponibles pour un papier donné d'un produit virtuel (filtrables). */
export function virtualFinishes(slug: string, paper: string, allowed?: ReadonlySet<number>): VirtualVariant[] {
  const vp = VIRTUAL_PRODUCTS[slug];
  if (!vp) return [];
  return vp.variants.filter((v) => v.paper === paper && (!allowed || allowed.has(v.productId)));
}

/** Résout (slug, papier, finition) → productId Sinalite, ou null. */
export function resolveVirtualProductId(slug: string, paper: string, finish: string): number | null {
  return VIRTUAL_PRODUCTS[slug]?.variants.find((v) => v.paper === paper && v.finish === finish)?.productId ?? null;
}

// ─── Collapse de la page produit ────────────────────────────────────────────
// Index INVERSE : productId Sinalite → slug du produit virtuel qui le contient.
// Sert à /order/product pour REMPLACER les N productId redondants d'une
// sous-famille (ex. les 6 « Greeting Cards ») par UNE carte virtuelle, tout en
// laissant les produits hors-virtuel (Foil, Letterhead, Notepads…) tels quels.
const PRODUCT_ID_TO_SLUG: Map<number, string> = (() => {
  const m = new Map<number, string>();
  for (const vp of Object.values(VIRTUAL_PRODUCTS)) {
    for (const v of vp.variants) m.set(v.productId, vp.slug);
  }
  return m;
})();

/** Slug du produit virtuel contenant ce productId, ou undefined. */
export function virtualSlugForProductId(productId: number): string | undefined {
  return PRODUCT_ID_TO_SLUG.get(productId);
}

/** Tous les productId couverts par un produit virtuel (pour filtrer la liste). */
export const ALL_VIRTUAL_PRODUCT_IDS: ReadonlySet<number> = new Set(PRODUCT_ID_TO_SLUG.keys());
