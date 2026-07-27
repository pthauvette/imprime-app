/**
 * Tests pour computeOptionPriceDelta / lookupComboPrice — finding [15].
 */

import { describe, it, expect } from 'vitest';
import { computeOptionPriceDelta, lookupComboPrice, type OptionDeltaContext } from '@/lib/products/option-price-delta';

describe('lookupComboPrice', () => {
  it('trouve le prix peu importe l\'ordre des ids (clé triée)', () => {
    const index = { '1-2-3': 15.05 };
    expect(lookupComboPrice([3, 1, 2], index)).toBe(15.05);
    expect(lookupComboPrice([1, 2, 3], index)).toBe(15.05);
  });

  it('combinaison absente → null (jamais deviné)', () => {
    expect(lookupComboPrice([9, 9, 9], { '1-2-3': 15.05 })).toBeNull();
  });
});

describe('computeOptionPriceDelta', () => {
  const baseCtx: OptionDeltaContext = {
    orderedGroups: ['stock', 'coating'],
    selection: { stock: 1, coating: 10 },
    qtyOptionId: 100,
    variantIndex: {
      '1-10-100': 15.05, // sélection courante
      '2-10-100': 18.00, // stock=2 (autre papier), même coating/qty
      '1-11-100': 12.50, // coating=11 (autre finition)
      // '3-10-100' volontairement ABSENT (combo inconnu de l'index)
    },
  };

  it('option plus chère → delta positif', () => {
    const d = computeOptionPriceDelta(baseCtx, 'stock', 2, 15.05);
    expect(d).toBeCloseTo(2.95, 2);
  });

  it('option moins chère → delta négatif', () => {
    const d = computeOptionPriceDelta(baseCtx, 'coating', 11, 15.05);
    expect(d).toBeCloseTo(-2.55, 2);
  });

  it('option actuellement sélectionnée → delta 0', () => {
    const d = computeOptionPriceDelta(baseCtx, 'stock', 1, 15.05);
    expect(d).toBe(0);
  });

  it('combinaison résultante absente de l\'index → null (pas de chiffre inventé)', () => {
    const d = computeOptionPriceDelta(baseCtx, 'stock', 3, 15.05);
    expect(d).toBeNull();
  });

  it('un AUTRE groupe sans sélection connue (état transitoire) → null', () => {
    const ctx: OptionDeltaContext = { ...baseCtx, selection: { stock: 1 } }; // coating manquant
    const d = computeOptionPriceDelta(ctx, 'stock', 2, 15.05);
    expect(d).toBeNull();
  });
});
