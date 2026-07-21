/**
 * Tests pour /api/orders/create — Round 15 #5.
 *
 * Cible : la route est complexe (Stripe + Sinalite + auth + Prisma). On test
 * le payload validation + l'intégration du GOLD perk (Round 13 #5) +
 * referral credit (Round 11). Les helpers sous-jacents (applyShippingPerks,
 * validatePromo, buildItemsSnapshot) sont déjà testés ailleurs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => null), // default : guest
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({ id: 'u_test', email: 't@plio.ca' })),
    },
    designDraft: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    abandonedCart: {
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

vi.mock('@/lib/db/orders', () => ({
  findOrCreateUserByEmail: vi.fn(async () => ({
    id: 'u_test', email: 't@plio.ca', firstName: 'T', lastName: 'P',
  })),
  createPendingOrder: vi.fn(async () => ({ id: 'order_test' })),
}));

// M2/M3 — la route utilise createReservedOrder (réserve + order.create atomiques).
const reservedMock = vi.hoisted(() => ({ fn: vi.fn(async () => ({ order: { id: 'order_test' }, replay: false })) }));
class InsufficientCreditErrorMock extends Error {}
vi.mock('@/lib/orders/credit-reservation', () => ({
  createReservedOrder: reservedMock.fn,
  InsufficientCreditError: InsufficientCreditErrorMock,
}));

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: {
    getProductDetail: vi.fn(async () => ({
      id: 1, name: 'Cartes UV', sku: 'BC-14UV',
      options: [
        { id: 4, group: 'Stock', name: '14pt UV' },
        { id: 30, group: 'size', name: '3.5x2' },
        { id: 1, group: 'qty', name: '100' },
      ],
      metadata: [],
    })),
    getProduct: vi.fn(async () => ({ id: 1, name: 'Cartes UV', category: 'Business Cards' })),
    getPrice: vi.fn(async () => ({ price: '50' })),
  },
}));

vi.mock('@/lib/sinalite/types', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sinalite/types')>('@/lib/sinalite/types');
  return actual;
});

vi.mock('@/lib/products/pricing', () => ({
  getEnrichedVariantIndex: vi.fn(async () => ({
    index: new Map<string, number>([['1-4-30', 50]]),
    hiddenOptionIds: new Set<number>(),
    marginPct: null,
    disabled: false,
    variantCount: 1,
  })),
}));

vi.mock('@/lib/promo/validate', () => ({
  normalizeCode: (s: string) => s.trim().toUpperCase(),
  validatePromo: vi.fn(async () => ({ ok: true, discountCents: 0, code: { code: 'TEST' } })),
}));

vi.mock('@/lib/orders/items', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orders/items')>('@/lib/orders/items');
  return {
    ...actual,
    buildItemsSnapshot: vi.fn(() => '[]'),
  };
});

// Audit #1 — revalidation fichiers serveur. On mocke le helper (testé à part dans
// src/lib/orders/revalidate-files.test.ts) pour piloter le résultat depuis la route.
const revalidateMock = vi.hoisted(() => ({ fn: vi.fn(async () => [] as unknown[]) }));
vi.mock('@/lib/orders/revalidate-files', () => ({
  revalidatePrintFiles: revalidateMock.fn,
}));

// Rate-limit (audit pré-lancement P2) — par défaut TOUT passe, pour que les
// ~40 tests existants restent inchangés ; les tests dédiés surchargent au cas
// par cas. Sans ce mock, le vrai module se charge sans Upstash → fail-open, donc
// le 429 serait intestable.
vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 99 })),
  clientIp: vi.fn(() => '203.0.113.7'),
}));

// Mock Stripe via vi.hoisted pour qu'il soit dispo dans le mock factory
const stripeMock = vi.hoisted(() => ({
  paymentIntents: {
    create: vi.fn(async () => ({
      id: 'pi_test_123',
      client_secret: 'pi_test_123_secret',
    })),
  },
  refunds: { create: vi.fn() },
  balance: { retrieve: vi.fn() },
}));

vi.mock('stripe', () => {
  function StripeMock(this: unknown) {
    return stripeMock;
  }
  return { default: StripeMock };
});

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { sinalite } from '@/lib/sinalite/client';
import { shippingQuoteToken } from '@/lib/shipping/quote-token';
import { rateLimit } from '@/lib/ratelimit';

const URL = 'http://localhost/api/orders/create';

function makeReq(body: unknown) {
  return new Request(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPayload = {
  items: [{
    productId: 1,
    optionIds: [4, 30, 1],
    files: [{ type: 'front', url: 'https://s3.example.com/file.pdf' }],
  }],
  contact: {
    firstName: 'Test', lastName: 'User',
    email: 'test@plio.ca',
    phone: '+15145551234',
  },
  shippingAddress: {
    line1: '123 rue Test', city: 'Montreal',
    province: 'QC', postalCode: 'H2X 1Y4',
  },
  shippingMethod: 'UPS Standard',
  shippingPrice: 20,
  expectedSubtotal: 50,
};

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(auth).mockResolvedValue(null as never);
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  stripeMock.paymentIntents.create.mockClear();
  revalidateMock.fn.mockReset();
  revalidateMock.fn.mockResolvedValue([]);
  vi.mocked(rateLimit).mockReset();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 99 } as never);
  vi.resetModules();
});

describe('/api/orders/create — payload validation', () => {
  it('400 si payload manque items', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({ ...validPayload, items: [] }));
    expect(res.status).toBe(400);
  });

  it('400 si email invalide', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({ ...validPayload, contact: { ...validPayload.contact, email: 'not-an-email' } }));
    expect(res.status).toBe(400);
  });

  it('400 si postalCode invalide format', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({
      ...validPayload,
      shippingAddress: { ...validPayload.shippingAddress, postalCode: 'INVALID' },
    }));
    expect(res.status).toBe(400);
  });

  it('400 si province pas Canada', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({
      ...validPayload,
      shippingAddress: { ...validPayload.shippingAddress, province: 'CA' }, // état US
    }));
    expect(res.status).toBe(400);
  });
});

describe('/api/orders/create — garde anti-tamper prix (audit v3 L3)', () => {
  it('409 PRICE_MISMATCH si expectedSubtotal diverge du recompute serveur', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    // serveur recompute 50 (mock variant index) ; le client prétend 1 → rejet.
    const res = await POST(makeReq({ ...validPayload, expectedSubtotal: 1 }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('PRICE_MISMATCH');
  });

  it('502 PRICE_FETCH_FAILED si variant hors index + prix Sinalite non numérique', async () => {
    vi.mocked(getEnrichedVariantIndex).mockResolvedValueOnce({
      index: new Map<string, number>(), // variant absent → fallback remote
      hiddenOptionIds: new Set<number>(),
      marginPct: null,
      disabled: false,
      variantCount: 0,
    } as never);
    vi.mocked(sinalite.getPrice).mockResolvedValueOnce({ price: 'NaN' } as never);
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('PRICE_FETCH_FAILED');
  });
});

describe('/api/orders/create — garde curation serveur (Funnel #3/#4)', () => {
  it('400 PRODUCT_DISABLED si le produit est désactivé par l\'admin', async () => {
    vi.mocked(getEnrichedVariantIndex).mockResolvedValueOnce({
      index: new Map<string, number>([['1-4-30', 50]]),
      hiddenOptionIds: new Set<number>(),
      marginPct: null,
      disabled: true,
      variantCount: 1,
    });
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PRODUCT_DISABLED');
  });

  it('400 OPTION_HIDDEN si une option choisie est masquée par l\'admin', async () => {
    vi.mocked(getEnrichedVariantIndex).mockResolvedValueOnce({
      index: new Map<string, number>([['1-4-30', 50]]),
      hiddenOptionIds: new Set<number>([30]), // l'option 30 est dans validPayload
      marginPct: null,
      disabled: false,
      variantCount: 1,
    });
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('OPTION_HIDDEN');
  });
});

describe('/api/orders/create — idempotence Stripe (Funnel #2)', () => {
  async function keyFor(body: unknown): Promise<string> {
    const { POST } = await import('@/app/api/orders/create/route');
    await POST(makeReq(body));
    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[unknown, { idempotencyKey: string }]>;
    return calls[calls.length - 1]![1].idempotencyKey;
  }

  it('internalRef volatil n\'affecte PAS la clé (retry de la même tentative → dédupé)', async () => {
    const a = await keyFor({ ...validPayload, idempotencyKey: 'attempt-1', items: [{ productId: 1, optionIds: [4, 30, 1], files: validPayload.items[0]!.files, internalRef: 'PLIO-111' }] });
    const b = await keyFor({ ...validPayload, idempotencyKey: 'attempt-1', items: [{ productId: 1, optionIds: [4, 30, 1], files: validPayload.items[0]!.files, internalRef: 'PLIO-999' }] });
    expect(a).toBe(b);
  });

  it('nonce de tentative différent → clé différente (re-commande identique possible)', async () => {
    const a = await keyFor({ ...validPayload, idempotencyKey: 'attempt-1' });
    const b = await keyFor({ ...validPayload, idempotencyKey: 'attempt-2' });
    expect(a).not.toBe(b);
  });
});

describe('/api/orders/create — GOLD perk integration (Round 13 #5)', () => {
  it('GOLD user → shippingCents = 0 dans Stripe metadata', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u_gold', email: 'gold@plio.ca', role: 'USER' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loyaltyTier: 'GOLD', referralCreditCents: 0,
    } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);

    expect(stripeMock.paymentIntents.create).toHaveBeenCalledOnce();
    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[Record<string, unknown> & { metadata?: Record<string, string> }]>;
    const piArgs = calls[0]?.[0];
    expect(piArgs).toBeDefined();
    // metadata stamp goldFreeShipping=true
    expect(piArgs!.metadata?.goldFreeShipping).toBe('true');
  });

  it('SILVER user → shipping facturé normalement, no perk metadata', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u_silver', email: 's@plio.ca', role: 'USER' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loyaltyTier: 'SILVER', referralCreditCents: 0,
    } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);

    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[Record<string, unknown> & { metadata?: Record<string, string> }]>;
    const piArgs = calls[0]?.[0];
    expect(piArgs).toBeDefined();
    expect(piArgs!.metadata?.goldFreeShipping).toBeUndefined();
  });

  it('Guest (no session) → pas de tier check, shipping facturé', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);

    // Pas de user.findUnique parce que pas de session
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[Record<string, unknown> & { metadata?: Record<string, string> }]>;
    const piArgs = calls[0]?.[0];
    expect(piArgs).toBeDefined();
    expect(piArgs!.metadata?.goldFreeShipping).toBeUndefined();
  });
});

describe('/api/orders/create — referral credit (Round 11)', () => {
  it('Applique le credit si user logged-in avec balance > 0', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u_credit', email: 'c@plio.ca', role: 'USER' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loyaltyTier: 'BRONZE', referralCreditCents: 1000, // 10$
    } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);

    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[Record<string, unknown> & { metadata?: Record<string, string> }]>;
    const piArgs = calls[0]?.[0];
    expect(piArgs).toBeDefined();
    // metadata stamp referralCreditApplied > 0
    expect(parseInt(piArgs!.metadata?.referralCreditApplied ?? '0', 10)).toBeGreaterThan(0);
  });

  it('Pas de credit pour guest', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);

    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[Record<string, unknown> & { metadata?: Record<string, string> }]>;
    const piArgs = calls[0]?.[0];
    expect(piArgs).toBeDefined();
    expect(piArgs!.metadata?.referralCreditApplied).toBe('0');
  });
});

describe('/api/orders/create — breakdown shape (Round 30 #1)', () => {
  it('Breakdown.total = Stripe amount (cents/100), pas subtotal+tax brut', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u_wallet', email: 'w@plio.ca', role: 'USER' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    // User avec 30 $ wallet + 10 $ referral
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loyaltyTier: 'BRONZE',
      referralCreditCents: 1000,
      walletCents: 3000,
      taxExempt: false,
      taxExemptCertId: null,
      resellerStatus: 'NONE',
    } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    const json = await res.json();

    // Breakdown doit exposer walletCredit + referralCredit
    expect(json.breakdown.walletCredit).toBeGreaterThan(0);
    expect(json.breakdown.referralCredit).toBeGreaterThan(0);
    // total = charge Stripe réelle (gross - wallet - referral)
    const calls = stripeMock.paymentIntents.create.mock.calls as unknown as Array<[{ amount: number }]>;
    const stripeAmount = calls[0]![0].amount; // cents
    expect(json.breakdown.total).toBeCloseTo(stripeAmount / 100, 2);
    // grossTotal > total quand credits appliqués
    expect(json.breakdown.grossTotal).toBeGreaterThan(json.breakdown.total);
  });

  it('Reseller VERIFIED → resellerDiscount > 0 + label dans breakdown', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u_reseller', email: 'r@plio.ca', role: 'USER' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loyaltyTier: 'BRONZE',
      referralCreditCents: 0,
      walletCents: 0,
      taxExempt: false,
      taxExemptCertId: null,
      resellerStatus: 'VERIFIED',
    } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.breakdown.resellerDiscount).toBeGreaterThan(0);
    expect(json.breakdown.resellerDiscountLabel).toMatch(/Reseller/);
  });

  it('Sans reseller / wallet / referral → fields à 0 (pas undefined)', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.breakdown.walletCredit).toBe(0);
    expect(json.breakdown.referralCredit).toBe(0);
    expect(json.breakdown.resellerDiscount).toBe(0);
    expect(json.breakdown.resellerDiscountLabel).toBeNull();
  });
});

describe('/api/orders/create — DesignDraft ownership (Audit v2 #5.3)', () => {
  it('lie le draft via updateMany gardé { id, userId, orderId:null } (pas update brut)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u_test', email: 't@plio.ca', role: 'USER' },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      loyaltyTier: 'BRONZE', referralCreditCents: 0, walletCents: 0,
      taxExempt: false, taxExemptCertId: null, resellerStatus: 'NONE',
    } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({ ...validPayload, designId: 'draft_other_user' }));
    expect(res.status).toBe(200);

    // ownership guard : empêche de rattacher le draft d'autrui + le re-link
    expect(prisma.designDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft_other_user', userId: 'u_test', orderId: null },
        data: { orderId: 'order_test' },
      }),
    );
    // l'ancien update brut (sans garde) n'est plus utilisé
    expect(prisma.designDraft.update).not.toHaveBeenCalled();
  });
});

describe('/api/orders/create — enforce du devis signé (ENFORCE_SHIPPING_SIG, audit v3 M6)', () => {
  // Sig valide pour le validPayload (UPS Standard, 20 $, QC, H2X 1Y4, produit 1).
  const validSig = () =>
    shippingQuoteToken({
      method: 'UPS Standard',
      price: 20,
      country: 'CA',
      province: 'QC',
      postal: 'H2X 1Y4',
      productIds: [1],
    });

  afterEach(() => vi.unstubAllEnvs());

  it('ENFORCE=1 + sig absente → 409 SHIPPING_QUOTE_INVALID', async () => {
    vi.stubEnv('ENFORCE_SHIPPING_SIG', '1');
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload)); // pas de shippingQuoteSig
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SHIPPING_QUOTE_INVALID');
  });

  it('ENFORCE=1 + sig valide → 200', async () => {
    vi.stubEnv('ENFORCE_SHIPPING_SIG', '1');
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({ ...validPayload, shippingQuoteSig: validSig() }));
    expect(res.status).toBe(200);
  });

  it('ENFORCE=1 + sig valide mais prix altéré après signature → 409', async () => {
    vi.stubEnv('ENFORCE_SHIPPING_SIG', '1');
    const { POST } = await import('@/app/api/orders/create/route');
    // sig signe price=20, on poste 19 → canonical diverge → rejet.
    const res = await POST(makeReq({ ...validPayload, shippingPrice: 19, shippingQuoteSig: validSig() }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SHIPPING_QUOTE_INVALID');
  });

  it('M1 — ENFORCE=1 + shippingPrice=0 sans sig → 409 (le bypass ne survit plus)', async () => {
    vi.stubEnv('ENFORCE_SHIPPING_SIG', '1');
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({ ...validPayload, shippingPrice: 0 }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SHIPPING_QUOTE_INVALID');
  });

  it('var absente (log-only) + sig absente → 200 (comportement par défaut inchangé)', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
  });
});

describe('/api/orders/create — revalidation fichiers serveur (audit #1)', () => {
  const blocker = [{
    url: validPayload.items[0].files[0].url,
    productId: 1,
    level: 'error' as const,
    blocking: true,
    issues: [{ level: 'error' as const, code: 'pdf-invalid', message: 'PDF corrompu.' }],
  }];

  afterEach(() => vi.unstubAllEnvs());

  it('var absente (défaut) → helper PAS appelé, 200 (inerte, aucune latence)', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    expect(revalidateMock.fn).not.toHaveBeenCalled();
  });

  it('FILE_REVALIDATION=enforce + fichier non conforme → 422 + Stripe NON appelé', async () => {
    vi.stubEnv('FILE_REVALIDATION', 'enforce');
    revalidateMock.fn.mockResolvedValueOnce(blocker);
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('FILE_NOT_CONFORMING');
    expect(body.details[0].code).toBe('pdf-invalid');
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('FILE_REVALIDATION=log + fichier non conforme → 200 (log seulement, ne bloque pas)', async () => {
    vi.stubEnv('FILE_REVALIDATION', 'log');
    revalidateMock.fn.mockResolvedValueOnce(blocker);
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    expect(revalidateMock.fn).toHaveBeenCalledOnce();
  });

  it('FILE_REVALIDATION=enforce + fichiers conformes → 200', async () => {
    vi.stubEnv('FILE_REVALIDATION', 'enforce');
    revalidateMock.fn.mockResolvedValueOnce([]);
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    expect(revalidateMock.fn).toHaveBeenCalledOnce();
  });
});

describe('/api/orders/create — réservation crédit M2/M3', () => {
  it('solde crédit insuffisant (concurrent) → 409 CREDIT_BALANCE_CHANGED', async () => {
    reservedMock.fn.mockRejectedValueOnce(new InsufficientCreditErrorMock('wallet'));
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('CREDIT_BALANCE_CHANGED');
    // Aucune commande finalisée (Stripe PI abandonné, non confirmé).
    expect(stripeMock.paymentIntents.create).toHaveBeenCalled(); // le PI a été créé AVANT la réservation
  });

  it('réservation OK → 200 (createReservedOrder appelé)', async () => {
    reservedMock.fn.mockResolvedValueOnce({ order: { id: 'order_test' }, replay: false });
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));
    expect(res.status).toBe(200);
    expect(reservedMock.fn).toHaveBeenCalled();
  });
});

/**
 * Audit pré-lancement 2026-07 (P2) — bornes du checkout WEB.
 *
 * Le jumeau headless (MCP create_order Mode B) avait deux buckets ; cette route,
 * qui fait le MÊME travail payant avant encaissement (téléchargements S3 pour la
 * revalidation, tarification Sinalite, objets Stripe), n'en avait aucun.
 */
describe('/api/orders/create — rate-limit', () => {
  const RL_429 = {
    ok: false,
    response: NextResponse.json({ code: 'RATE_LIMITED' }, { status: 429 }),
  };

  it('borne par appelant dépassée → 429 AVANT toute revalidation ou appel Stripe', async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(RL_429 as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));

    expect(res.status).toBe(429);
    // Le point du correctif : rien de coûteux ne doit avoir tourné.
    expect(revalidateMock.fn).not.toHaveBeenCalled();
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('plafond AGRÉGÉ dépassé → 429 même si la borne par appelant passe', async () => {
    // Le cas qui compte : un attaquant qui fait tourner X-Forwarded-For satisfait
    // toujours le bucket par-IP. Seul le plafond global l'arrête.
    vi.mocked(rateLimit)
      .mockResolvedValueOnce({ ok: true, remaining: 99 } as never)
      .mockResolvedValueOnce(RL_429 as never);

    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq(validPayload));

    expect(res.status).toBe(429);
    expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('anonyme → keyé par IP ; connecté → keyé par userId (le NAT ne punit pas des clients distincts)', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    await POST(makeReq(validPayload));
    expect(vi.mocked(rateLimit).mock.calls[0]).toEqual(['orderCreate', 'ip:203.0.113.7']);
    expect(vi.mocked(rateLimit).mock.calls[1]).toEqual(['orderCreateGlobal', 'all']);

    vi.mocked(rateLimit).mockClear();
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u_42', email: 'a@b.ca' } } as never);
    vi.resetModules();
    const { POST: POST2 } = await import('@/app/api/orders/create/route');
    await POST2(makeReq(validPayload));
    expect(vi.mocked(rateLimit).mock.calls[0]).toEqual(['orderCreate', 'u:u_42']);
  });

  it('client CONNECTÉ immunisé contre le plafond agrégé (un flood anonyme ne coupe pas ses paiements)', async () => {
    // Le correctif issu de la revue adversariale : un plafond global inconditionnel
    // laissait n'importe qui couper le checkout de TOUS les clients en quelques
    // secondes de curl, sans compte ni payload valide.
    vi.mocked(auth).mockResolvedValue({ user: { id: 'u_fidele', email: 'a@b.ca' } } as never);

    const { POST } = await import('@/app/api/orders/create/route');
    await POST(makeReq(validPayload));

    const buckets = vi.mocked(rateLimit).mock.calls.map((c) => c[0]);
    expect(buckets).toContain('orderCreate');
    expect(buckets).not.toContain('orderCreateGlobal');
  });

  it('un corps malformé part en 400 SANS consommer de quota', async () => {
    const { POST } = await import('@/app/api/orders/create/route');
    const res = await POST(makeReq({ ...validPayload, items: [] }));

    expect(res.status).toBe(400);
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
