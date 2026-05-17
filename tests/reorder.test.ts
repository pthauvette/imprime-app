/**
 * Tests pour buildReorderDeepLink — pure function, pas de mocks.
 */

import { describe, it, expect } from 'vitest';
import { buildReorderDeepLink } from '@/lib/orders/reorder';

describe('buildReorderDeepLink', () => {
  it('construit l\'URL depuis payload Sinalite typique', () => {
    const payload = JSON.stringify({
      items: [{
        productId: 1,
        options: { Stock: '30', size: '4', sides: '107' },
        files: [{ type: 'front', url: 'https://s3/x.pdf' }],
      }],
    });
    const r = buildReorderDeepLink(payload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toMatch(/^\/order\/configure\?productId=1&options=/);
      // L'ordre des options dépend de Object.values — vérifier les 3 sont là
      expect(r.url).toContain('30');
      expect(r.url).toContain('4');
      expect(r.url).toContain('107');
    }
  });

  it('prend juste le premier item si multi-items', () => {
    const payload = JSON.stringify({
      items: [
        { productId: 1, options: { Stock: '30' }, files: [{ type: 'front', url: 'x' }] },
        { productId: 99, options: { Stock: '88' }, files: [{ type: 'front', url: 'y' }] },
      ],
    });
    const r = buildReorderDeepLink(payload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain('productId=1');
      expect(r.url).not.toContain('productId=99');
    }
  });

  it('parse-error si payload pas JSON', () => {
    const r = buildReorderDeepLink('not json at all');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('parse-error');
  });

  it('no-items si items vide', () => {
    const r = buildReorderDeepLink(JSON.stringify({ items: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-items');
  });

  it('no-items si items absent', () => {
    const r = buildReorderDeepLink(JSON.stringify({ shippingInfo: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-items');
  });

  it('invalid-payload si productId manque', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ options: { Stock: '30' } }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-payload');
  });

  it('invalid-payload si options vide', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 1, options: {} }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-payload');
  });

  it('skip les options non-numériques', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 5, options: { Stock: '30', custom: 'abc', size: '4' } }],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain('options=30,4');
    }
  });

  it('refuse si toutes options non-numériques', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 1, options: { Stock: 'invalid' } }],
    }));
    expect(r.ok).toBe(false);
  });
});
