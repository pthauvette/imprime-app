/**
 * refundAmountCentsOf — Audit v2 #10.6.
 *
 * Le dashboard finances doit sommer le montant RÉELLEMENT remboursé (refund
 * partiel inclus), pas le total de la commande. Verrouille : lit data.amountCents
 * quand présent, sinon fallback sur le total commande (events pré-fix).
 */

import { describe, it, expect } from 'vitest';
import { refundAmountCentsOf } from '@/lib/finances/refund-amount';

describe('refundAmountCentsOf (#10.6)', () => {
  it('refund partiel : lit data.amountCents (pas le total commande)', () => {
    const ev = { data: JSON.stringify({ refundId: 're_1', amountCents: 2000 }), order: { amountCents: 8000 } };
    expect(refundAmountCentsOf(ev)).toBe(2000); // 20 $ remboursé, PAS 80 $
  });

  it('refund full : data.amountCents = total', () => {
    const ev = { data: JSON.stringify({ refundId: 're_2', amountCents: 8000 }), order: { amountCents: 8000 } };
    expect(refundAmountCentsOf(ev)).toBe(8000);
  });

  it('event pré-fix (data sans amountCents) → fallback total commande', () => {
    const ev = { data: JSON.stringify({ refundId: 're_old' }), order: { amountCents: 5000 } };
    expect(refundAmountCentsOf(ev)).toBe(5000);
  });

  it('data null → fallback total commande', () => {
    expect(refundAmountCentsOf({ data: null, order: { amountCents: 3000 } })).toBe(3000);
  });

  it('data malformé → fallback total commande', () => {
    expect(refundAmountCentsOf({ data: 'not-json{', order: { amountCents: 4200 } })).toBe(4200);
  });

  it('amountCents non numérique dans data → fallback', () => {
    const ev = { data: JSON.stringify({ amountCents: 'oops' }), order: { amountCents: 1500 } };
    expect(refundAmountCentsOf(ev)).toBe(1500);
  });

  it('order null (purge SetNull) + data sans montant → 0', () => {
    expect(refundAmountCentsOf({ data: JSON.stringify({ refundId: 'x' }), order: null })).toBe(0);
  });
});
