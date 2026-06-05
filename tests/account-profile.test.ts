/**
 * Rectification self-serve (Loi 25 art. 27) — normalizeProfileInput.
 * Valide la validation + le recalcul du `name` composite dénormalisé.
 */
import { describe, it, expect } from 'vitest';
import { normalizeProfileInput, composeName } from '@/lib/account/profile';

describe('composeName', () => {
  it('compose prénom + nom', () => {
    expect(composeName('Sophie', 'Beauchamp')).toBe('Sophie Beauchamp');
  });
  it('prénom seul / nom seul', () => {
    expect(composeName('Solo', null)).toBe('Solo');
    expect(composeName(undefined, 'Roy')).toBe('Roy');
  });
  it('vides / null → null (fallback côté lecture)', () => {
    expect(composeName(null, null)).toBeNull();
    expect(composeName('', '')).toBeNull();
  });
  it('tronque à 200 caractères', () => {
    expect(composeName('a'.repeat(150), 'b'.repeat(150))?.length).toBe(200);
  });
});

describe('normalizeProfileInput', () => {
  it('valide + recalcule le name composite', () => {
    const r = normalizeProfileInput({ firstName: 'Sophie', lastName: 'Beauchamp', phone: '(514) 555-1234' });
    expect(r).toEqual({
      ok: true,
      data: { firstName: 'Sophie', lastName: 'Beauchamp', phone: '(514) 555-1234', name: 'Sophie Beauchamp' },
    });
  });

  it('trim les espaces', () => {
    const r = normalizeProfileInput({ firstName: '  Léa  ', lastName: '  Roy ', phone: ' 5145551234 ' });
    expect(r.ok && r.data).toEqual({ firstName: 'Léa', lastName: 'Roy', phone: '5145551234', name: 'Léa Roy' });
  });

  it('champs vides → null, name null', () => {
    const r = normalizeProfileInput({ firstName: '', lastName: '', phone: '' });
    expect(r.ok && r.data).toEqual({ firstName: null, lastName: null, phone: null, name: null });
  });

  it('null/undefined bruts (FormData absent) → null', () => {
    const r = normalizeProfileInput({ firstName: null, lastName: undefined, phone: null });
    expect(r.ok && r.data.name).toBeNull();
  });

  it('prénom seul → name = prénom', () => {
    const r = normalizeProfileInput({ firstName: 'Solo', lastName: '', phone: '' });
    expect(r.ok && r.data.name).toBe('Solo');
  });

  it('rejette un téléphone avec des lettres', () => {
    const r = normalizeProfileInput({ firstName: 'X', lastName: 'Y', phone: '514-ABCD' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/téléphone/i);
  });

  it('rejette un prénom > 100 caractères', () => {
    const r = normalizeProfileInput({ firstName: 'a'.repeat(101), lastName: '', phone: '' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/prénom/i);
  });

  it('accepte les formats téléphone usuels (+, espaces, parenthèses, points)', () => {
    for (const phone of ['+1 514 555 1234', '514.555.1234', '(514) 555-1234', '5145551234']) {
      expect(normalizeProfileInput({ firstName: 'A', lastName: 'B', phone }).ok).toBe(true);
    }
  });

  it('tronque le name composite à 200 caractères', () => {
    const r = normalizeProfileInput({ firstName: 'a'.repeat(100), lastName: 'b'.repeat(100), phone: '' });
    expect(r.ok && r.data.name?.length).toBe(200);
  });
});
