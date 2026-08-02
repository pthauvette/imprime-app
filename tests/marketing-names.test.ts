/**
 * Garde de couverture des noms marketing.
 *
 * Le risque n'est pas qu'un nom soit MAL traduit — ça se voit à la relecture —
 * mais qu'un produit passe entre les mailles : sans entrée dans la table, la
 * fiche retombe silencieusement sur le nom Sinalite brut, en anglais, avec le
 * jargon d'atelier. Le repli est volontaire (on n'invente jamais un nom), donc
 * rien ne casse : ça s'affiche juste en anglais sans que personne le remarque.
 *
 * Ce test compare la table à un instantané du catalogue Sinalite et échoue si
 * un produit affiché au client n'est pas couvert — c'est le seul moment où la
 * lacune est visible avant la production.
 *
 * La fixture est VERSIONNÉE (tests/fixtures/) et non lue depuis
 * `docs/sinalite-catalogue-map.draft.json` : ce dernier est gitignoré
 * (`docs/sinalite-*.draft.json`), donc absent en CI — un test qui s'appuie
 * dessus passe en local et échoue sur le runner. Même patron que la fixture
 * voisine `sinalite-product-names.json`.
 */

import { describe, it, expect } from 'vitest';
import { MARKETING_NAMES, CATEGORY_LABELS, categoryLabelFor, marketingNameFor } from '@/lib/products/marketing-names';
import fixture from './fixtures/sinalite-raw-products.json';

/** Produits affichés tels quels au client (ni virtuels, ni masqués). */
const rawProducts: { id: number; name: string; category: string }[] = fixture.produits;

describe('noms marketing', () => {
  it('couvre TOUS les produits bruts affichés au client', () => {
    const nonCouverts = rawProducts
      .filter((p) => !MARKETING_NAMES[p.id])
      .map((p) => `#${p.id} ${p.name}`);
    expect(nonCouverts).toEqual([]);
  });

  it('couvre toutes les catégories Sinalite affichées', () => {
    const nonCouvertes = [...new Set(rawProducts.map((p) => p.category))]
      .filter((c) => !CATEGORY_LABELS[c]);
    expect(nonCouvertes).toEqual([]);
  });

  it('ne laisse aucun nom en anglais évident', () => {
    // Mots qui trahissent le libellé fournisseur non traduit. `Sintra` et
    // `mesh` sont EXCLUS : ce sont les termes du métier en français aussi.
    const anglicismes = /\b(Business Cards?|Stickers?|Labels?|Envelopes?|Banners?|Signs?|Board|Stand|Magnets?|Notepads?|Forms?|Calendars?|Covers?|Boxes|Roll Labels|Printed|Gloss|Matte Finish|Uncoated|Writable|Profit Maximizer)\b/;
    const suspects = Object.entries(MARKETING_NAMES)
      .filter(([, v]) => anglicismes.test(v.name))
      .map(([id, v]) => `#${id} ${v.name}`);
    expect(suspects).toEqual([]);
  });

  it('replie sur la valeur d’origine quand le produit/la catégorie est inconnu', () => {
    // Sinalite ajoute des SKU sans préavis : le repli DOIT rester silencieux
    // et non destructif plutôt que de lever ou d'inventer un nom.
    expect(marketingNameFor(999_999)).toBeUndefined();
    expect(categoryLabelFor('Brand New Category')).toBe('Brand New Category');
  });

  it('mappe les doublons Sinalite à tiret final vers le même libellé', () => {
    // Séquelle de leur back-office : « Pull Up Banners » ET « Pull Up Banners- ».
    expect(categoryLabelFor('Pull Up Banners-')).toBe(categoryLabelFor('Pull Up Banners'));
    expect(categoryLabelFor('Coroplast Signs & Yard Signs-')).toBe(
      categoryLabelFor('Coroplast Signs & Yard Signs'),
    );
  });
});
