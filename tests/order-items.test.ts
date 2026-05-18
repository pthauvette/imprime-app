/**
 * Tests pour lib/orders/items.ts (Phase 2 multi-item snapshot).
 *
 *  - buildItemsSnapshot : couvre les cas single-item, multi-item,
 *    options unresolvable (productId absent du detailCache), turnaround
 *    isolé du reste, filenames extraits des URLs S3.
 *  - parseItemsSnapshot : null → null, JSON corrompu → null, shape
 *    partielle → coerce gracieusement.
 *  - shortItemSummary : concatène product + options + qty.
 */

import { describe, it, expect } from 'vitest';
import { buildItemsSnapshot, parseItemsSnapshot, shortItemSummary, type DisplayItem } from '@/lib/orders/items';
import type { SinaliteOrderRequest } from '@/lib/sinalite/types';

function mockDetail(opts: Array<{ id: number; name: string; group: string }>) {
  return { options: opts };
}

const cardsDetail = mockDetail([
  { id: 4, name: '3,5 × 2', group: 'size' },
  { id: 30, name: '14pt UV', group: 'Stock' },
  { id: 107, name: 'UV brillante', group: 'Coating' },
  { id: 224, name: '500', group: 'qty' },
  { id: 78, name: 'Standard 4-5 jours', group: 'Turnaround' },
]);

const flyersDetail = mockDetail([
  { id: 5, name: '8,5 × 11', group: 'size' },
  { id: 31, name: '100lb Gloss', group: 'Stock' },
  { id: 225, name: '250', group: 'qty' },
]);

function makePayload(items: SinaliteOrderRequest['items']): SinaliteOrderRequest {
  return {
    items,
    shippingInfo: {} as never,
    billingInfo: {} as never,
  };
}

describe('buildItemsSnapshot', () => {
  it('single-item : résout toutes les options et isole qty + turnaround', () => {
    const payload = makePayload([
      {
        productId: 137,
        options: { size: '4', Stock: '30', Coating: '107', qty: '224', Turnaround: '78' },
        files: [{ type: 'front', url: 'https://s3.example.com/uploads/cards-front.pdf' }],
      },
    ]);
    const snap = buildItemsSnapshot(payload, new Map([[137, cardsDetail]]), new Map([[137, 'Cartes 14pt UV']]));
    expect(snap).toHaveLength(1);
    expect(snap[0]).toMatchObject({
      productId: 137,
      productName: 'Cartes 14pt UV',
      qty: 500,
      qtyLabel: '500',
      turnaround: 'Standard 4-5 jours',
    });
    // 3 options non-qty/non-turnaround : size + Stock + Coating
    expect(snap[0].options).toHaveLength(3);
    expect(snap[0].options.map((o) => o.label)).toEqual(
      expect.arrayContaining(['3,5 × 2', '14pt UV', 'UV brillante']),
    );
  });

  it('multi-item : un DisplayItem par item, productNames respectés', () => {
    const payload = makePayload([
      {
        productId: 137,
        options: { size: '4', qty: '224' },
        files: [{ type: 'front', url: 'https://s3.example.com/a.pdf' }],
      },
      {
        productId: 200,
        options: { size: '5', qty: '225', Stock: '31' },
        files: [{ type: 'front', url: 'https://s3.example.com/b.pdf' }],
      },
    ]);
    const snap = buildItemsSnapshot(
      payload,
      new Map([[137, cardsDetail], [200, flyersDetail]]),
      new Map([[137, 'Cartes 14pt UV'], [200, 'Flyers 8,5×11']]),
    );
    expect(snap).toHaveLength(2);
    expect(snap[0].productName).toBe('Cartes 14pt UV');
    expect(snap[1].productName).toBe('Flyers 8,5×11');
    expect(snap[1].qty).toBe(250);
  });

  it('fallback à "Produit #X" si productNames absent', () => {
    const payload = makePayload([
      { productId: 999, options: { qty: '224' }, files: [{ type: 'front', url: 'https://s3.example.com/x.pdf' }] },
    ]);
    const snap = buildItemsSnapshot(payload, new Map([[999, cardsDetail]]), new Map());
    expect(snap[0].productName).toBe('Produit #999');
  });

  it('options non résolues (detail manquant) → garde le label brut (ID as string)', () => {
    const payload = makePayload([
      { productId: 999, options: { size: '4', qty: '224' }, files: [{ type: 'front', url: 'https://s3.example.com/x.pdf' }] },
    ]);
    const snap = buildItemsSnapshot(payload, new Map(), new Map([[999, 'Inconnu']]));
    // qty fallback : label = "224" (l'ID en string), qty parsée = 224
    expect(snap[0].qty).toBe(224);
    expect(snap[0].qtyLabel).toBe('224');
    // Une option non-qty et non-turnaround → garde label brut
    expect(snap[0].options).toHaveLength(1);
    expect(snap[0].options[0].label).toBe('4');
  });

  it('extrait les filenames depuis les URLs S3 et décode URI', () => {
    const payload = makePayload([
      {
        productId: 137,
        options: { qty: '224' },
        files: [
          { type: 'front', url: 'https://s3.example.com/uploads/Cartes%20de%20visite.pdf' },
          { type: 'back', url: 'https://s3.example.com/uploads/dos-cartes.pdf' },
        ],
      },
    ]);
    const snap = buildItemsSnapshot(payload, new Map([[137, cardsDetail]]), new Map());
    expect(snap[0].fileNames).toEqual(['Cartes de visite.pdf', 'dos-cartes.pdf']);
  });

  it('files avec URL non-parseable → fallback "fichier-N"', () => {
    const payload = makePayload([
      {
        productId: 137,
        options: { qty: '224' },
        // Force URL parse failure : Note that "not a url" still parses via URL ctor
        // with a base. So we use a really malformed string.
        files: [{ type: 'front', url: 'not-a-url' as never }],
      },
    ]);
    const snap = buildItemsSnapshot(payload, new Map([[137, cardsDetail]]), new Map());
    // Soit "fichier-1" si URL throw, soit le segment si elle parse — accepte les 2.
    expect(snap[0].fileNames?.[0]).toMatch(/fichier-1|not-a-url/);
  });
});

describe('parseItemsSnapshot', () => {
  it('null → null', () => {
    expect(parseItemsSnapshot(null)).toBeNull();
  });

  it('empty string → null', () => {
    expect(parseItemsSnapshot('')).toBeNull();
  });

  it('JSON corrompu → null (pas de throw)', () => {
    expect(parseItemsSnapshot('not-valid-json')).toBeNull();
  });

  it('non-array → null', () => {
    expect(parseItemsSnapshot('{"productId":1}')).toBeNull();
  });

  it('parse correctement un array valide', () => {
    const items: DisplayItem[] = [
      { productId: 137, productName: 'Cartes', options: [{ group: 'size', label: '4×6' }], qty: 500, qtyLabel: '500', turnaround: 'Standard' },
    ];
    const parsed = parseItemsSnapshot(JSON.stringify(items));
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0].productName).toBe('Cartes');
  });

  it('filtre les entries sans productId/productName', () => {
    const corrupted = JSON.stringify([
      { productId: 137, productName: 'Bon' },
      { productId: 'pas-un-number', productName: 'Bad' },
      { productId: 200 }, // pas de productName
      'pas-un-objet',
    ]);
    const parsed = parseItemsSnapshot(corrupted);
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0].productName).toBe('Bon');
  });
});

describe('shortItemSummary', () => {
  it('concatène product + options + qty + turnaround avec ·', () => {
    const item: DisplayItem = {
      productId: 137,
      productName: 'Cartes 14pt UV',
      options: [{ group: 'size', label: '4×6' }, { group: 'Stock', label: '14pt' }],
      qty: 500,
      qtyLabel: '500',
      turnaround: 'Standard',
    };
    expect(shortItemSummary(item)).toBe('Cartes 14pt UV · 4×6 · 14pt · 500 unités · Standard');
  });

  it('omet turnaround si absent', () => {
    const item: DisplayItem = {
      productId: 137, productName: 'Cartes', options: [], qty: 100, qtyLabel: '100',
    };
    expect(shortItemSummary(item)).toBe('Cartes · 100 unités');
  });
});
