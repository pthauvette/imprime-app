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
import {
  ALL_VIRTUAL_PRODUCT_IDS,
  virtualDisplayNameForProductId,
} from '@/lib/products/virtual-products';
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

  it('nomme TOUTES les variantes virtuelles (parcours principal du wizard)', () => {
    // Ces productId sont atteints via /order/v/<slug> puis /order/configure :
    // sans nom recomposé, le fil d'Ariane retombe sur le libellé Sinalite brut.
    const sansNom = [...ALL_VIRTUAL_PRODUCT_IDS].filter(
      (id) => !virtualDisplayNameForProductId(id),
    );
    expect(sansNom).toEqual([]);
  });

  it('traduit les catégories des variantes virtuelles (fil d’Ariane config)', () => {
    // Ces catégories n'apparaissent QUE dans le fil d'Ariane du configurateur,
    // pas dans le picker — elles avaient donc été oubliées au premier passage :
    // « Business Cards › Carte de visite — 14pt », moitié anglais moitié
    // français dans le même fil.
    const categoriesVirtuelles = [
      'Business Cards', 'Postcards', 'Specialty Post Cards', 'Flyers', 'Brochures',
      'Booklets', 'Tear Cards', 'Greeting Cards', 'Invitations', 'Door Hangers',
      'Bookmarks', 'Presentation Folders', 'Posters', 'Digital Sheets',
    ];
    const nonTraduites = categoriesVirtuelles.filter((c) => !CATEGORY_LABELS[c]);
    expect(nonTraduites).toEqual([]);
  });

  it('produit des noms de variantes UNIQUES', () => {
    // C'est ce test qui VALIDE l'omission de la finition sur un papier
    // `specialty` (cf. virtualDisplayNameForProductId) : si un tel papier
    // gagnait une 2e finition, deux variantes porteraient le même nom et le
    // fil d'Ariane mentirait sur ce que le client a choisi.
    const noms = [...ALL_VIRTUAL_PRODUCT_IDS].map((id) => virtualDisplayNameForProductId(id)!);
    const doublons = noms.filter((n, i) => noms.indexOf(n) !== i);
    expect([...new Set(doublons)]).toEqual([]);
  });

  it('ne laisse aucun anglicisme fournisseur dans les noms de variantes', () => {
    // `Flyer` est EXCLU : c'est le terme courant en français au Québec (la
    // famille du catalogue s'appelle « Flyers & dépliants »), pas un anglicisme
    // résiduel. Idem `mesh`/`Sintra` plus haut — vocabulaire du métier.
    const anglicismes = /\b(Business Cards?|Printed|Gloss(y)? Text|Matte Finish|Uncoated|Writable|High Gloss|Profit Maximizer|Booklets?|Postcards?|Greeting Cards?)\b/;
    const suspects = [...ALL_VIRTUAL_PRODUCT_IDS]
      .map((id) => `#${id} ${virtualDisplayNameForProductId(id)}`)
      .filter((n) => anglicismes.test(n));
    expect(suspects).toEqual([]);
  });

  it('mappe les doublons Sinalite à tiret final vers le même libellé', () => {
    // Séquelle de leur back-office : « Pull Up Banners » ET « Pull Up Banners- ».
    expect(categoryLabelFor('Pull Up Banners-')).toBe(categoryLabelFor('Pull Up Banners'));
    expect(categoryLabelFor('Coroplast Signs & Yard Signs-')).toBe(
      categoryLabelFor('Coroplast Signs & Yard Signs'),
    );
  });
});
