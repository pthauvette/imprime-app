import { describe, it, expect } from 'vitest';
import {
  groupVisibleOptions,
  availableQuantities,
  selectQuoteOptionIds,
  formatQuoteText,
} from './quote';
import type { SinaliteOption } from '@/lib/sinalite/types';

const OPTS: SinaliteOption[] = [
  { id: 5, group: 'size', name: '3.5x2' },
  { id: 6, group: 'size', name: '4x2' },
  { id: 30, group: 'Stock', name: '14pt' },
  { id: 107, group: 'Coating', name: 'AQ' },
  { id: 201, group: 'qty', name: '100' },
  { id: 202, group: 'qty', name: '250' },
  { id: 203, group: 'qty', name: '500' },
  { id: 301, group: 'Turnaround', name: '5 jours' },
  { id: 999, group: 'Coating', name: 'CACHÉ' }, // masqué par admin
];

describe('MCP quote — helpers purs', () => {
  it('groupVisibleOptions groupe par `group` et filtre les options masquées', () => {
    const groups = groupVisibleOptions(OPTS, new Set([999]));
    expect(Object.keys(groups).sort()).toEqual(['Coating', 'Stock', 'Turnaround', 'qty', 'size']);
    expect(groups['Coating'].map((o) => o.id)).toEqual([107]); // 999 filtré
    expect(groups['qty']).toHaveLength(3);
  });

  it('availableQuantities parse + trie les quantités', () => {
    const groups = groupVisibleOptions(OPTS, new Set());
    expect(availableQuantities(groups)).toEqual([100, 250, 500]);
  });

  it('selectQuoteOptionIds prend la 1re option de chaque groupe non-qty + la qty demandée', () => {
    const groups = groupVisibleOptions(OPTS, new Set([999]));
    const sel = selectQuoteOptionIds(groups, 500);
    expect(sel.ok).toBe(true);
    if (sel.ok) {
      // 1re de size(5), Stock(30), Coating(107), Turnaround(301) + qty 500 (id 203)
      expect(sel.optionIds.sort((a, b) => a - b)).toEqual([5, 30, 107, 203, 301]);
    }
  });

  it('selectQuoteOptionIds échoue proprement si la quantité est indisponible', () => {
    const groups = groupVisibleOptions(OPTS, new Set());
    const sel = selectQuoteOptionIds(groups, 12345);
    expect(sel.ok).toBe(false);
    if (!sel.ok) expect(sel.availableQuantities).toEqual([100, 250, 500]);
  });

  it('ne prend jamais une option qty comme option non-qty (clé sans doublon qty)', () => {
    const groups = groupVisibleOptions(OPTS, new Set());
    const sel = selectQuoteOptionIds(groups, 250);
    if (sel.ok) {
      const qtyIds = [201, 202, 203];
      const qtyInKey = sel.optionIds.filter((id) => qtyIds.includes(id));
      expect(qtyInKey).toEqual([202]); // exactement UNE option qty (la demandée)
    }
  });

  it('formatQuoteText rend un devis lisible avec le total CAD', () => {
    const text = formatQuoteText('cartes-de-visite', '14pt', 'aq', {
      ok: true, productId: 2, quantity: 500, totalCad: 42.5, unitPriceCad: 0.085,
    });
    expect(text).toContain('42.50 $ CAD');
    expect(text).toContain('500 unités');
    expect(text).not.toContain('undefined');
  });
});
