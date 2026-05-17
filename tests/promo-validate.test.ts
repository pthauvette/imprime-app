/**
 * Tests pour validatePromo — pure function, pas de mocks DB.
 * Couvre tous les failureCode + tous les chemins discount (pct, cents, cap).
 */

import { describe, it, expect } from 'vitest';
import type { PromoCode } from '@prisma/client';
import { validatePromo, normalizeCode } from '@/lib/promo/validate';

function fixture(overrides: Partial<PromoCode> = {}): PromoCode {
  return {
    id: 'promo_1',
    code: 'BIENVENUE10',
    label: 'Test',
    discountPct: 10,
    discountCents: null,
    active: true,
    expiresAt: null,
    maxUses: null,
    usesCount: 0,
    minSubtotalCents: null,
    firstOrderOnly: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('normalizeCode', () => {
  it('upper + trim', () => {
    expect(normalizeCode('  bienvenue10  ')).toBe('BIENVENUE10');
    expect(normalizeCode('Désolé20')).toBe('DÉSOLÉ20');
  });
});

describe('validatePromo — failure cases', () => {
  const ctx = { subtotalCents: 10000, orderCountForUser: 0 };

  it('NOT_FOUND si promo est null', () => {
    const r = validatePromo(null, ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('NOT_FOUND');
  });

  it('INACTIVE si active=false', () => {
    const r = validatePromo(fixture({ active: false }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('INACTIVE');
  });

  it('EXPIRED si expiresAt < now', () => {
    const r = validatePromo(
      fixture({ expiresAt: new Date('2024-01-01') }),
      { ...ctx, now: new Date('2026-01-01') },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureCode).toBe('EXPIRED');
      expect(r.message).toMatch(/expir/);
    }
  });

  it('OK si expiresAt > now', () => {
    const r = validatePromo(
      fixture({ expiresAt: new Date('2027-01-01') }),
      { ...ctx, now: new Date('2026-01-01') },
    );
    expect(r.ok).toBe(true);
  });

  it('MAX_USES_REACHED si usesCount >= maxUses', () => {
    const r = validatePromo(fixture({ maxUses: 50, usesCount: 50 }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('MAX_USES_REACHED');
  });

  it('MIN_SUBTOTAL_NOT_MET avec msg formaté', () => {
    const r = validatePromo(
      fixture({ minSubtotalCents: 15000 }),
      { ...ctx, subtotalCents: 10000 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failureCode).toBe('MIN_SUBTOTAL_NOT_MET');
      expect(r.message).toMatch(/150,00 \$/);
    }
  });

  it('FIRST_ORDER_ONLY rejette si orderCountForUser > 0', () => {
    const r = validatePromo(
      fixture({ firstOrderOnly: true }),
      { ...ctx, orderCountForUser: 3 },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('FIRST_ORDER_ONLY');
  });

  it('FIRST_ORDER_ONLY OK si orderCountForUser = 0', () => {
    const r = validatePromo(fixture({ firstOrderOnly: true }), ctx);
    expect(r.ok).toBe(true);
  });

  it('INVALID_DISCOUNT_CONFIG si les deux discount sont set', () => {
    const r = validatePromo(
      fixture({ discountPct: 10, discountCents: 500 }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('INVALID_DISCOUNT_CONFIG');
  });

  it('INVALID_DISCOUNT_CONFIG si aucun discount set', () => {
    const r = validatePromo(
      fixture({ discountPct: null, discountCents: null }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('INVALID_DISCOUNT_CONFIG');
  });

  it('INVALID_DISCOUNT_CONFIG si discountPct = 0', () => {
    const r = validatePromo(
      fixture({ discountPct: 0 }),
      ctx,
    );
    expect(r.ok).toBe(false);
  });
});

describe('validatePromo — discount computation', () => {
  it('10 % sur 100 $ = 10 $', () => {
    const r = validatePromo(fixture({ discountPct: 10 }), {
      subtotalCents: 10000,
      orderCountForUser: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountCents).toBe(1000);
      expect(r.message).toMatch(/10 % de rabais/);
      expect(r.message).toMatch(/10,00 \$/);
    }
  });

  it('20 % avec arrondi : 187,42 * 0.20 = 3748,4 → 3748 cents', () => {
    const r = validatePromo(fixture({ discountPct: 20 }), {
      subtotalCents: 18742,
      orderCountForUser: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discountCents).toBe(3748);
  });

  it('flat 5 $ → 500 cents', () => {
    const r = validatePromo(
      fixture({ discountPct: null, discountCents: 500 }),
      { subtotalCents: 10000, orderCountForUser: 0 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.discountCents).toBe(500);
      expect(r.message).toMatch(/5,00 \$/);
    }
  });

  it('cap : flat 20 $ avec subtotal 5 $ → discount capé à 5 $', () => {
    const r = validatePromo(
      fixture({ discountPct: null, discountCents: 2000 }),
      { subtotalCents: 500, orderCountForUser: 0 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discountCents).toBe(500);
  });

  it('100 % discount = subtotal complet remisé', () => {
    const r = validatePromo(fixture({ discountPct: 100 }), {
      subtotalCents: 10000,
      orderCountForUser: 0,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discountCents).toBe(10000);
  });
});

describe('validatePromo — combined restrictions', () => {
  it('passe les checks séquentiellement (inactive avant expired)', () => {
    const r = validatePromo(
      fixture({ active: false, expiresAt: new Date('2024-01-01') }),
      { subtotalCents: 10000, orderCountForUser: 0, now: new Date('2026-01-01') },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failureCode).toBe('INACTIVE');
  });

  it('toutes restrictions OK + 15 % sur 200 $', () => {
    const r = validatePromo(
      fixture({
        discountPct: 15,
        minSubtotalCents: 10000,
        maxUses: 100,
        usesCount: 42,
        expiresAt: new Date('2027-01-01'),
        firstOrderOnly: false,
      }),
      { subtotalCents: 20000, orderCountForUser: 5, now: new Date('2026-01-01') },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.discountCents).toBe(3000);
  });
});
