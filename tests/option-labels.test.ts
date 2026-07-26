import { describe, it, expect } from 'vitest';
import { buildOptionSummary } from '@/lib/products/option-labels';

const optionGroups = {
  size: [{ id: 4, group: 'size', name: '3.5x2' }],
  Stock: [
    { id: 30, group: 'Stock', name: '14pt' },
    { id: 31, group: 'Stock', name: '16pt' },
  ],
  Coating: [{ id: 107, group: 'Coating', name: 'UV haute brillance' }],
  qty: [{ id: 500, group: 'qty', name: '500' }],
};

describe('buildOptionSummary', () => {
  it('résout chaque optionId sélectionné en "GroupeFR: nom"', () => {
    const r = buildOptionSummary([4, 30, 107], optionGroups);
    expect(r).toEqual(['Format: 3.5x2', 'Papier: 14pt', 'Finition: UV haute brillance']);
  });

  it('omet la quantité (qty a déjà sa propre ligne dans le récap)', () => {
    const r = buildOptionSummary([4, 500], optionGroups);
    expect(r).toEqual(['Format: 3.5x2']);
  });

  it('un optionId introuvable (drift Sinalite) est omis silencieusement, pas de crash', () => {
    const r = buildOptionSummary([4, 99999], optionGroups);
    expect(r).toEqual(['Format: 3.5x2']);
  });

  it('groupe non mappé → utilise le nom brut du groupe en fallback', () => {
    const r = buildOptionSummary([200], { 'Weird Group': [{ id: 200, group: 'Weird Group', name: 'X' }] });
    expect(r).toEqual(['Weird Group: X']);
  });

  it('liste vide → tableau vide', () => {
    expect(buildOptionSummary([], optionGroups)).toEqual([]);
  });
});
