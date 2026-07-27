import { describe, it, expect } from 'vitest';
import { SinaliteOption } from '@/lib/sinalite/types';

describe('SinaliteOption', () => {
  it('parse une option normale (group présent) sans y toucher', () => {
    const parsed = SinaliteOption.parse({ id: 1, group: 'Stock', name: '14pt Coated' });
    expect(parsed).toEqual({ id: 1, group: 'Stock', name: '14pt Coated' });
  });

  // finding [12] — Roll Labels / Stickers (et probablement d'autres) renvoient
  // au moins une option sans `group` côté Sinalite ; avant ce fix, un seul
  // item comme celui-ci faisait échouer TOUT le array Zod → fiche produit
  // en crash permanent pour ce client.
  it('group manquant → repli "Autre" au lieu de faire échouer le parse', () => {
    const parsed = SinaliteOption.parse({ id: 2, name: 'Some Option' });
    expect(parsed).toEqual({ id: 2, group: 'Autre', name: 'Some Option' });
  });

  it('group null → repli "Autre"', () => {
    const parsed = SinaliteOption.parse({ id: 3, group: null, name: 'Some Option' });
    expect(parsed).toEqual({ id: 3, group: 'Autre', name: 'Some Option' });
  });
});
