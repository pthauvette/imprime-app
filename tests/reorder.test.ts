/**
 * Tests pour buildReorderDeepLink — pure function, pas de mocks.
 */

import { describe, it, expect } from 'vitest';
import { buildReorderDeepLink } from '@/lib/orders/reorder';

describe('finding [54]/[119] — réutilisation des fichiers au réachat (garde 90j)', () => {
  const payloadWithFiles = JSON.stringify({
    items: [{
      productId: 1,
      options: { Stock: '30' },
      files: [
        { type: 'front', url: 'https://s3.example/recto.pdf' },
        { type: 'back', url: 'https://s3.example/verso.pdf' },
      ],
    }],
  });

  it('commande FRAÎCHE (créée aujourd\'hui) → ?files= porté sur le deep-link', () => {
    const r = buildReorderDeepLink(payloadWithFiles, new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).toContain('files=front:');
    expect(r.url).toContain('|back:');
  });

  it('commande VIEILLE (>85j, purge S3 probable) → PAS de ?files=, force un nouvel upload', () => {
    const old = new Date(Date.now() - 100 * 24 * 3600 * 1000);
    const r = buildReorderDeepLink(payloadWithFiles, old);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).not.toContain('files=');
  });

  it('juste sous la limite (84j) → encore considérée fraîche', () => {
    const almostOld = new Date(Date.now() - 84 * 24 * 3600 * 1000);
    const r = buildReorderDeepLink(payloadWithFiles, almostOld);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).toContain('files=');
  });

  it('pas de champ `files` dans le payload (anciennes commandes pré-fix) → pas de crash, pas de files=', () => {
    const payload = JSON.stringify({ items: [{ productId: 1, options: { Stock: '30' } }] });
    const r = buildReorderDeepLink(payload, new Date());
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('expected ok');
    expect(r.url).not.toContain('files=');
  });
});

describe('buildReorderDeepLink', () => {
  it('construit l\'URL depuis payload Sinalite typique', () => {
    const payload = JSON.stringify({
      items: [{
        productId: 1,
        options: { Stock: '30', size: '4', sides: '107' },
        files: [{ type: 'front', url: 'https://s3/x.pdf' }],
      }],
    });
    const r = buildReorderDeepLink(payload, new Date());
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
    const r = buildReorderDeepLink(payload, new Date());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain('productId=1');
      expect(r.url).not.toContain('productId=99');
    }
  });

  it('parse-error si payload pas JSON', () => {
    const r = buildReorderDeepLink('not json at all', new Date());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('parse-error');
  });

  it('no-items si items vide', () => {
    const r = buildReorderDeepLink(JSON.stringify({ items: [] }), new Date());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-items');
  });

  it('no-items si items absent', () => {
    const r = buildReorderDeepLink(JSON.stringify({ shippingInfo: {} }), new Date());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-items');
  });

  it('invalid-payload si productId manque', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ options: { Stock: '30' } }],
    }), new Date());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-payload');
  });

  it('invalid-payload si options vide', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 1, options: {} }],
    }), new Date());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid-payload');
  });

  it('skip les options non-numériques', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 5, options: { Stock: '30', custom: 'abc', size: '4' } }],
    }), new Date());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain('options=30,4');
    }
  });

  it('refuse si toutes options non-numériques', () => {
    const r = buildReorderDeepLink(JSON.stringify({
      items: [{ productId: 1, options: { Stock: 'invalid' } }],
    }), new Date());
    expect(r.ok).toBe(false);
  });
});
