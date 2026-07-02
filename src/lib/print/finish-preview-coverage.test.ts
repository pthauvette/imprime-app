/**
 * Verrou « chaque produit rend à la BONNE DIMENSION et la BONNE TEXTURE ».
 *
 * L'aperçu produit (swatch + 3D) dérive :
 *  - sa DIMENSION du trim de la famille (margin-specs) → un slug sans spec dédiée
 *    tombe au défaut carte de visite (3.5×2) = mauvaise forme ;
 *  - sa TEXTURE de la finition/papier (finish-materials) → une finition sans surcharge
 *    tombe sur BASE (« sans couche ») = mauvais rendu pour uv/spot-uv/soft-touch/foil.
 *
 * Ces tests échouent dès qu'une famille/finition/papier du catalogue perd sa couverture
 * (ex. ajout d'une famille Sinalite sans margin-spec) → « tous les produits » reste vrai.
 */
import { describe, it, expect } from 'vitest';
import { VIRTUAL_PRODUCTS } from '@/lib/products/virtual-products';
import { MARGIN_SPECS_BY_FAMILY } from '@/lib/products/margin-specs';
import { KNOWN_FINISH_KEYS, KNOWN_PAPER_KEYS, finishMaterial, fitCardDimensions } from './finish-materials';

const SLUGS = Object.keys(VIRTUAL_PRODUCTS);
const MAX = 2.3;

describe('couverture DIMENSION — chaque famille a son trim réel', () => {
  it('chaque famille VIRTUAL_PRODUCTS a une margin-spec dédiée (sinon → défaut 3.5×2)', () => {
    for (const slug of SLUGS) {
      const spec = MARGIN_SPECS_BY_FAMILY[slug];
      expect(spec, `famille "${slug}" sans margin-spec → tomberait à la dimension carte de visite`).toBeDefined();
      expect(spec.typicalTrim.widthIn).toBeGreaterThan(0);
      expect(spec.typicalTrim.heightIn).toBeGreaterThan(0);
    }
  });

  it('les 8 familles ont des trims DISTINCTS (pas toutes ramenées à un seul format)', () => {
    const ratios = SLUGS.map((s) => {
      const t = MARGIN_SPECS_BY_FAMILY[s].typicalTrim;
      return (t.widthIn / t.heightIn).toFixed(3);
    });
    // au moins 4 ratios distincts (paysage carte, portrait flyer, portrait signet, etc.)
    expect(new Set(ratios).size).toBeGreaterThanOrEqual(4);
  });
});

describe('couverture TEXTURE — chaque finition/papier a un vrai matériau', () => {
  const finishes = new Set<string>();
  const specialtyPapers = new Set<string>();
  for (const p of Object.values(VIRTUAL_PRODUCTS)) {
    for (const v of p.variants) finishes.add(v.finish);
    for (const pa of p.papers) if (pa.specialty) specialtyPapers.add(pa.key);
  }

  it('chaque finition du catalogue a une surcharge matériau (jamais un BASE silencieux)', () => {
    for (const f of finishes) {
      expect(KNOWN_FINISH_KEYS, `finition "${f}" sans surcharge → rendue « sans couche » (faux pour uv/spot-uv/soft-touch…)`).toContain(f);
    }
  });

  it('chaque papier specialty a une surcharge de base (teinte/rugosité/nacre)', () => {
    for (const pa of specialtyPapers) {
      expect(KNOWN_PAPER_KEYS, `papier specialty "${pa}" sans surcharge → rendu papier blanc standard`).toContain(pa);
    }
  });

  it('signatures optiques distinctes (uv brillant ≠ mat, soft-touch velours, foil métal, spot-uv sélectif)', () => {
    const uv = finishMaterial('uv');
    const matte = finishMaterial('matte');
    expect(uv.clearcoat).toBeGreaterThan(matte.clearcoat);
    expect(uv.clearcoatRoughness).toBeLessThan(matte.clearcoatRoughness);
    expect(finishMaterial('soft-touch').sheen).toBeGreaterThan(0);
    expect(finishMaterial('foil').metalness).toBe(1);
    expect(finishMaterial('spot-uv').spotUv).toBe(true);
    expect(finishMaterial('standard', 'pearl').iridescence).toBeGreaterThan(0); // nacré
  });
});

describe('fitCardDimensions — la boîte 3D tient dans le cadre, ratio réel préservé', () => {
  it('paysage (carte 3.5×2) : largeur = max, hauteur dérivée, ne déborde pas', () => {
    const { w, h } = fitCardDimensions(3.5 / 2);
    expect(w).toBeCloseTo(MAX);
    expect(h).toBeCloseTo(MAX / (3.5 / 2));
    expect(Math.max(w, h)).toBeLessThanOrEqual(MAX + 1e-9);
  });

  it('portrait (signet 2×8) : hauteur = max, largeur dérivée, JAMAIS rogné (avant : 14 unités)', () => {
    const { w, h } = fitCardDimensions(2 / 8);
    expect(h).toBeCloseTo(MAX);
    expect(w).toBeCloseTo(MAX * (2 / 8));
    expect(Math.max(w, h)).toBeLessThanOrEqual(MAX + 1e-9);
  });

  it('AUCUNE famille réelle ne déborde du cadre, ratio exact préservé', () => {
    for (const slug of SLUGS) {
      const t = MARGIN_SPECS_BY_FAMILY[slug].typicalTrim;
      const aspect = t.widthIn / t.heightIn;
      const { w, h } = fitCardDimensions(aspect);
      expect(Math.max(w, h), `${slug} déborde le cadre`).toBeLessThanOrEqual(MAX + 1e-9);
      expect(w / h).toBeCloseTo(aspect, 5);
    }
  });

  it('aspect invalide (0 / NaN) → fallback carte de visite, pas de NaN', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const { w, h } = fitCardDimensions(bad);
      expect(Number.isFinite(w) && Number.isFinite(h)).toBe(true);
    }
  });
});
