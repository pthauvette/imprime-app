/**
 * Mapping PUR finition/papier Plio → paramètres d'un `MeshPhysicalMaterial`
 * Three.js, pour l'aperçu 3D de l'effet de finition (#5).
 *
 * Aucune dépendance Three.js ici (juste des nombres/couleurs) → testable sans
 * WebGL, et réutilisable côté serveur si besoin. Le composant 3D
 * (FinishPreview3D) consomme ces valeurs.
 *
 * Chaque finition a une SIGNATURE OPTIQUE physique :
 *  - vernis UV / lamination glossy → `clearcoat` fort + `clearcoatRoughness` bas
 *    (reflet net et profond) ;
 *  - AQ (glossy léger) → clearcoat moyen, reflet diffus ;
 *  - mat / lamination mate → clearcoat très bas, surface qui « mange » la lumière ;
 *  - soft-touch (velours) → `sheen` élevé + `roughness` ~1 (rétrodiffusion mate
 *    type pêche) ;
 *  - Spot UV → base mate + clearcoat appliqué sur un MASQUE (vernis sélectif) ;
 *  - foil (dorure) → `metalness` 1 + couleur métal.
 *
 * Le PAPIER module la base : nacré → `iridescence`, kraft/enviro/lin → teinte +
 * rugosité accrue (non couché).
 */

export interface FinishMaterial {
  /** Rugosité micro-surface [0..1]. 0 = miroir, 1 = totalement diffus. */
  roughness: number;
  /** Métallicité [0..1]. >0 réservé au foil. */
  metalness: number;
  /** Couche de vernis transparente [0..1] (AQ/UV/lamination/spot-uv). */
  clearcoat: number;
  /** Rugosité du vernis [0..1]. Bas = reflet net (UV), haut = reflet flou (mat). */
  clearcoatRoughness: number;
  /** Voile velouté [0..1] — soft-touch. */
  sheen: number;
  /** Rugosité du voile velouté [0..1]. */
  sheenRoughness: number;
  /** Couleur du voile velouté (hex). */
  sheenColor: string;
  /** Iridescence (film mince) [0..1] — papier nacré. */
  iridescence: number;
  /** Teinte de base appliquée à la carte (hex) ou null = garder la texture/blanc. */
  baseTint: string | null;
  /** Vernis SÉLECTIF : le composant applique le clearcoat sur un masque, pas partout. */
  spotUv: boolean;
  /** Couleur du métal pour le foil (hex) ou null = pas de foil. */
  foilColor: string | null;
  /** Libellé court de l'effet rendu (UI/accessibilité). */
  effectLabel: string;
}

/** Base neutre = papier blanc non couché, aucune brillance. */
const BASE: FinishMaterial = {
  roughness: 0.82,
  metalness: 0,
  clearcoat: 0,
  clearcoatRoughness: 0.5,
  sheen: 0,
  sheenRoughness: 0.8,
  sheenColor: '#ffffff',
  iridescence: 0,
  baseTint: null,
  spotUv: false,
  foilColor: null,
  effectLabel: 'Sans couche',
};

/** Surcharges PAR FINITION (le coating détermine gloss/voile/métal). */
const FINISH_OVERRIDES: Record<string, Partial<FinishMaterial>> = {
  standard: { effectLabel: 'Sans couche' },

  // Vernis aqueux léger : reflet doux et diffus.
  aq: { roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.32, effectLabel: 'AQ — glossy léger' },

  // Vernis UV haute brillance : reflet net et profond.
  uv: { roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06, effectLabel: 'UV — haute brillance' },

  // Mat : surface qui mange la lumière.
  matte: { roughness: 0.72, clearcoat: 0.12, clearcoatRoughness: 0.7, effectLabel: 'Mat' },

  // Laminations (film) — mate vs glossy.
  'matte-lam': { roughness: 0.74, clearcoat: 0.18, clearcoatRoughness: 0.7, effectLabel: 'Lamination mate' },
  'gloss-lam': { roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.05, effectLabel: 'Lamination glossy' },

  // Soft-touch : velours mat avec voile (sheen).
  'soft-touch': {
    roughness: 0.95, clearcoat: 0, sheen: 1, sheenRoughness: 0.85, sheenColor: '#f3efe9',
    effectLabel: 'Soft touch — velours',
  },

  // Spot UV : base mate + vernis SÉLECTIF (masque).
  'spot-uv': {
    roughness: 0.72, clearcoat: 1, clearcoatRoughness: 0.05, spotUv: true,
    effectLabel: 'Mat + Spot UV (vernis sélectif)',
  },

  // Inscriptibles = non couché (on écrit dessus au stylo) → mat franc.
  writable: { roughness: 0.9, effectLabel: 'Inscriptible (non couché)' },
  'writable-aq': { roughness: 0.78, clearcoat: 0.2, clearcoatRoughness: 0.5, effectLabel: 'Inscriptible + AQ' },
  'writable-uv': { roughness: 0.7, clearcoat: 0.35, clearcoatRoughness: 0.3, effectLabel: 'Inscriptible + UV' },

  // Foil / dorure (produit séparé, supporté pour le futur).
  foil: { metalness: 1, roughness: 0.2, foilColor: '#d4af37', effectLabel: 'Dorure (foil métallique)' },
  'foil-silver': { metalness: 1, roughness: 0.18, foilColor: '#cfd2d6', effectLabel: 'Foil argent' },
};

/** Surcharges PAR PAPIER (la base, indépendamment du coating). */
const PAPER_OVERRIDES: Record<string, Partial<FinishMaterial>> = {
  kraft: { baseTint: '#b89b72', roughness: 0.9 },
  enviro: { baseTint: '#efeae0', roughness: 0.9 },
  // Feuilles numériques : deux grammages de recyclé non couché (13pt carte /
  // 80lb texte) — même rendu papier que `enviro`, clés distinctes pour ne pas
  // dupliquer (papier, finition) dans le produit virtuel.
  'enviro-13pt': { baseTint: '#efeae0', roughness: 0.9 },
  'enviro-80lb': { baseTint: '#efeae0', roughness: 0.9 },
  linen: { baseTint: '#f3f1ea', roughness: 0.92 },
  pearl: { iridescence: 0.55, baseTint: '#f6f3ef', roughness: 0.45 },
  synthetic: { roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35 },
  ultrasmooth: { roughness: 0.6 },
  // Stock métallique (papier « foil doré ») : reflet métallique chaud, MAIS le design
  // reste visible (pas de foilColor → la texture n'est pas masquée, contrairement à la
  // FINITION foil qui, elle, démontre le métal plein). Distingue le stock du papier blanc.
  foil: { baseTint: '#e4d3a1', metalness: 0.5, roughness: 0.28, clearcoat: 0.4, clearcoatRoughness: 0.22 },
};

/**
 * Résout les paramètres matériau pour une (finition, papier). La finition pose
 * le coating (gloss/voile/métal) ; le papier module la base (teinte/rugosité/
 * iridescence) sans écraser un fort coating (on garde le min de rugosité, etc.).
 */
export function finishMaterial(finishKey: string | null | undefined, paperKey?: string | null): FinishMaterial {
  const finish = FINISH_OVERRIDES[finishKey ?? ''] ?? {};
  const paper = paperKey ? (PAPER_OVERRIDES[paperKey] ?? {}) : {};

  // La finition prime sur la base ; le papier s'applique ensuite mais ne doit pas
  // « ternir » un vernis : si la finition a posé un clearcoat fort, le papier ne
  // remonte pas la rugosité au-delà.
  const merged: FinishMaterial = { ...BASE, ...paper, ...finish };

  // Iridescence (nacré) : additive, on la garde même si la finition ne la fixe pas.
  if (paper.iridescence != null && finish.iridescence == null) merged.iridescence = paper.iridescence;
  // Teinte papier : visible seulement si la finition ne la fixe pas (ex. foil).
  if (paper.baseTint != null && finish.baseTint == null) merged.baseTint = paper.baseTint;

  return merged;
}

/** Toutes les clés de finition connues (pour itérer en démo/test). */
export const KNOWN_FINISH_KEYS = Object.keys(FINISH_OVERRIDES);

/** Toutes les clés de papier connues (surcharges de base). */
export const KNOWN_PAPER_KEYS = Object.keys(PAPER_OVERRIDES);

/** Le plus grand côté de l'aperçu 3D tient dans MAX_EXTENT unités-monde (portrait
 *  comme paysage) → un signet 2×8, un flyer 8,5×11 ou une invitation 5×7 rendent à
 *  leur VRAIE forme sans déborder du cadre. */
const MAX_EXTENT = 2.3;

/**
 * Dimensions de la boîte 3D (unités-monde) normalisées pour tenir dans le cadre tout
 * en préservant le ratio RÉEL du produit (aspect = largeur/hauteur). PUR → testable
 * sans WebGL. Avant : largeur figée + hauteur = 3.5/aspect → les formats hauts (jusqu'à
 * 14 unités pour un signet) étaient rognés hors cadre.
 */
export function fitCardDimensions(aspect: number, maxExtent = MAX_EXTENT): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 3.5 / 2;
  return a >= 1 ? { w: maxExtent, h: maxExtent / a } : { w: maxExtent * a, h: maxExtent };
}
