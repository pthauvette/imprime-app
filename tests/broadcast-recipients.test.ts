/**
 * Tests pour resolveRecipients — vérifie les segments tier-* et
 * inactive-90d (les nouveaux du Round 12 #5).
 *
 * On mock prisma pour vérifier le shape exact des where clauses construites
 * — c'est là que le bug peut sortir (mauvais tier name, mauvais cutoff,
 * filtre opt-out manqué).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: vi.fn(async () => []),
    },
    newsletterSubscriber: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  resolveRecipients,
  SEGMENT_LABELS,
  ALL_SEGMENTS,
} from '@/lib/broadcast/recipients';

beforeEach(() => {
  vi.mocked(prisma.user.findMany).mockClear();
  vi.mocked(prisma.newsletterSubscriber.findMany).mockClear();
  vi.mocked(prisma.newsletterSubscriber.count).mockClear();
});

describe('resolveRecipients — segments existants', () => {
  it('newsletter → query NewsletterSubscriber ACTIVE', async () => {
    vi.mocked(prisma.newsletterSubscriber.findMany).mockResolvedValueOnce([
      { email: 'a@x.com' }, { email: 'b@x.com' }, { email: 'a@x.com' },
    ] as never);
    const out = await resolveRecipients('newsletter');
    expect(out).toEqual(['a@x.com', 'b@x.com']); // dédupé
    const arg = vi.mocked(prisma.newsletterSubscriber.findMany).mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ status: 'ACTIVE' });
  });

  it('customers → opted-in + order paid dans 24m', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([
      { email: 'a@x.com' },
    ] as never);
    await resolveRecipients('customers');
    const arg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0];
    expect(arg?.where?.emailMarketing).toBe(true);
    expect((arg?.where?.orders?.some?.status as { in?: string[] })?.in).toEqual(
      expect.arrayContaining(['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED']),
    );
  });
});

describe('resolveRecipients — tier segments (Round 12 #5)', () => {
  it('tier-gold → loyaltyTier=GOLD + opted-in, pas de filtre order', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    await resolveRecipients('tier-gold');
    const arg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0];
    expect(arg?.where?.loyaltyTier).toBe('GOLD');
    expect(arg?.where?.emailMarketing).toBe(true);
    // GOLD a une CASL implicite via le tier (revenu > 2000 $) — pas besoin du filtre order
    expect(arg?.where?.orders).toBeUndefined();
  });

  it('tier-silver → loyaltyTier=SILVER + opted-in', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    await resolveRecipients('tier-silver');
    const arg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0];
    expect(arg?.where?.loyaltyTier).toBe('SILVER');
  });

  it('tier-bronze → loyaltyTier=BRONZE + filtre order (CASL window)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    await resolveRecipients('tier-bronze');
    const arg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0];
    expect(arg?.where?.loyaltyTier).toBe('BRONZE');
    // BRONZE contient les users qui n'ont jamais commandé (default) →
    // pour CASL on exige ≥ 1 order paid dans la fenêtre 24 mois.
    expect((arg?.where?.orders?.some?.status as { in?: string[] })?.in).toEqual(
      expect.arrayContaining(['PAID', 'DELIVERED']),
    );
  });
});

describe('resolveRecipients — inactive-90d', () => {
  it('inactive-90d → order dans 24m mais aucune dans 90j', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValueOnce([] as never);
    await resolveRecipients('inactive-90d');
    const arg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0];
    const where = arg?.where as Record<string, unknown>;
    expect(where?.emailMarketing).toBe(true);
    const orders = where?.orders as { some?: Record<string, unknown>; none?: Record<string, unknown> };
    expect(orders?.some).toBeDefined();
    expect(orders?.none).toBeDefined();
    // Le cutoff "none dans 90j" doit être plus récent que "some dans 24m"
    const someGte = (orders?.some?.createdAt as { gte?: Date })?.gte;
    const noneGte = (orders?.none?.createdAt as { gte?: Date })?.gte;
    expect(noneGte).toBeInstanceOf(Date);
    expect(someGte).toBeInstanceOf(Date);
    expect((noneGte as Date).getTime()).toBeGreaterThan((someGte as Date).getTime());
  });
});

describe('SEGMENT_LABELS / ALL_SEGMENTS', () => {
  it('a un label pour chaque segment', () => {
    for (const s of ALL_SEGMENTS) {
      expect(SEGMENT_LABELS[s]).toBeTruthy();
      expect(typeof SEGMENT_LABELS[s]).toBe('string');
    }
  });

  it('contient les 7 segments attendus', () => {
    expect(ALL_SEGMENTS).toEqual([
      'newsletter', 'customers', 'all',
      'tier-gold', 'tier-silver', 'tier-bronze',
      'inactive-90d',
    ]);
  });
});
