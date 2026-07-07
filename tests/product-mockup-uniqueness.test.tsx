/**
 * Unicité des visuels produits générés EN CODE (ProductMockup).
 *
 * Les vignettes ne sont pas des images : deux produits qui partagent le même
 * couple (forme, finition) rendent EXACTEMENT le même SVG. Ce test rend chaque
 * mockup (renderToStaticMarkup, sans title pour comparer le VISUEL pur) et
 * verrouille que :
 *   1. les 8 familles du catalogue (/order/start) ont 8 visuels distincts ;
 *   2. les 6 tuiles promo de l'accueil ont 6 visuels distincts ;
 *   3. fait connu (assumé) : `matte` et `plain` rendent identiquement — si une
 *      surface les met côte à côte sur la MÊME forme, ce sera un doublon.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProductMockup from '@/components/wizard/ProductMockup';
import { mockupForIcon, type MockupShape, type MockupFinish } from '@/lib/products/product-mockup';
import { CATEGORY_GROUPS } from '@/lib/catalogue';

function markup(shape: MockupShape, finish: MockupFinish): string {
  return renderToStaticMarkup(<ProductMockup shape={shape} finish={finish} />);
}

describe('ProductMockup — unicité des visuels', () => {
  it('catalogue : chaque famille a un visuel DISTINCT (rendu SVG comparé)', () => {
    const byFamily = CATEGORY_GROUPS.map((g) => {
      const m = mockupForIcon(g.icon);
      return { slug: g.slug, svg: markup(m.shape, m.finish) };
    });
    // Pairwise : signaler précisément QUELLES familles se dupliquent.
    for (let i = 0; i < byFamily.length; i++) {
      for (let j = i + 1; j < byFamily.length; j++) {
        expect(
          byFamily[i].svg === byFamily[j].svg
            ? `DOUBLON : ${byFamily[i].slug} et ${byFamily[j].slug} rendent le même SVG`
            : 'distinct',
        ).toBe('distinct');
      }
    }
    expect(new Set(byFamily.map((f) => f.svg)).size).toBe(CATEGORY_GROUPS.length);
  });

  it('accueil : les 6 tuiles promo ont 6 visuels distincts', () => {
    // Doit refléter les props de src/app/page.tsx (grille .product-promo).
    const tiles: Array<[MockupShape, MockupFinish]> = [
      ['card', 'gloss'],
      ['card', 'soft'],
      ['card', 'foil'],
      ['flyer', 'matte'],
      ['banner', 'matte'],
      ['card', 'kraft'],
    ];
    const svgs = tiles.map(([s, f]) => markup(s, f));
    expect(new Set(svgs).size).toBe(tiles.length);
  });

  it('fait assumé : matte ≡ plain visuellement (même fill, aucun trait distinctif)', () => {
    // Verrou documentaire : si on différencie un jour matte de plain dans
    // ProductMockup, ce test rappellera de re-vérifier les surfaces (aucune ne
    // met aujourd'hui matte et plain côte à côte sur la même forme).
    expect(markup('card', 'matte')).toBe(markup('card', 'plain'));
  });

  it('chaque finition VISUELLEMENT distincte l\'est aussi en rendu (sur une carte)', () => {
    const finishes: MockupFinish[] = ['gloss', 'foil', 'matte', 'soft', 'kraft', 'green'];
    const svgs = finishes.map((f) => markup('card', f));
    expect(new Set(svgs).size).toBe(finishes.length);
  });

  it('chaque forme rend distinctement (à finition égale)', () => {
    const shapes: MockupShape[] = ['card', 'flyer', 'postcard', 'banner', 'sticker', 'folded'];
    const svgs = shapes.map((s) => markup(s, 'plain'));
    expect(new Set(svgs).size).toBe(shapes.length);
  });
});
