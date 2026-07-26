/**
 * Tests pour buildReorderDeepLink — la fonction critique qui transforme
 * un Order existant en URL deep-link wizard pré-remplie.
 *
 * Round 20 #5 — ferme le gap "pas de test sur cette path critique"
 * (la fonction est utilisée depuis 3 sites : email delivered, customer
 * /orders/[id], admin reorder-for-client).
 */

import { describe, it, expect } from 'vitest';
import { buildReorderDeepLink } from '@/lib/orders/reorder';

describe('buildReorderDeepLink', () => {
  it('happy path : payload valide → URL /order/configure', () => {
    const payload = JSON.stringify({
      items: [{
        productId: 7,
        options: { Stock: '30', size: '4', coating: '107' },
      }],
    });
    const r = buildReorderDeepLink(payload, new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).toBe('/order/configure?productId=7&options=30,4,107');
  });

  it('garde seulement les IDs numériques (skip non-int values)', () => {
    const payload = JSON.stringify({
      items: [{
        productId: 12,
        options: { Stock: '30', custom: 'abc', size: '4' },
      }],
    });
    const r = buildReorderDeepLink(payload, new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).toContain('options=30,4');
  });

  it('multi-items → prend juste le premier (wizard mono-produit)', () => {
    const payload = JSON.stringify({
      items: [
        { productId: 7, options: { id: '30' } },
        { productId: 99, options: { id: '88' } },
      ],
    });
    const r = buildReorderDeepLink(payload, new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).toContain('productId=7');
    expect(r.url).not.toContain('productId=99');
  });

  it('parse-error si JSON invalide', () => {
    const r = buildReorderDeepLink('not json {', new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('parse-error');
  });

  it('no-items si items array vide', () => {
    const r = buildReorderDeepLink(JSON.stringify({ items: [] }), new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('no-items');
  });

  it('no-items si items pas un array', () => {
    const r = buildReorderDeepLink(JSON.stringify({ items: 'not an array' }), new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('no-items');
  });

  it('no-items si pas de field items du tout', () => {
    const r = buildReorderDeepLink(JSON.stringify({ other: 'shape' }), new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('no-items');
  });

  it('invalid-payload si productId pas numérique', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 'oops', options: { id: '30' } }],
    }), new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('invalid-payload');
  });

  it('invalid-payload si options manquantes', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 7 }],
    }), new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('invalid-payload');
  });

  it('invalid-payload si zéro options valides après filter', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 7, options: { Stock: 'foo', size: 'bar' } }],
    }), new Date());
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('expected fail');
    expect(r.reason).toBe('invalid-payload');
  });

  it('skip valeurs négatives ou zéro dans options', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 7, options: { a: '0', b: '-5', c: '12' } }],
    }), new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).toContain('options=12');
  });
});
