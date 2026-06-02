/**
 * Tests du diagnostic « carts coincés » (Round 46).
 *
 * - isStuck : prédicat pur (silent-loss = pas converti, pas supprimé).
 * - findStuckCarts : filtre les candidats SQL, exclut converti/supprimé,
 *   enrichit recoverable (≤72h), trie récupérables d'abord.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    order: { findMany: vi.fn(async () => []) },
    emailSuppression: { findMany: vi.fn(async () => []) },
  },
}));

import { prisma } from '@/lib/db';
import { isStuck, findStuckCarts, type StuckCartCandidate } from '@/lib/cron/stuck-carts';

const baseCart: StuckCartCandidate = {
  id: 'c',
  email: 'a@b.ca',
  productId: 7,
  lastStep: 'shipping',
  emailSentAt: new Date(),
  updatedAt: new Date(),
};

describe('isStuck — silent-loss = ni converti ni supprimé', () => {
  it('converti → PAS coincé (le client a commandé autrement)', () => {
    expect(isStuck(baseCart, { converted: true, suppressed: false, hoursSinceAbandon: 1 })).toBe(false);
  });
  it('supprimé → PAS coincé (hard bounce/plainte, skip légitime)', () => {
    expect(isStuck(baseCart, { converted: false, suppressed: true, hoursSinceAbandon: 1 })).toBe(false);
  });
  it('ni converti ni supprimé → coincé (silent-loss), indépendant de l’âge', () => {
    expect(isStuck(baseCart, { converted: false, suppressed: false, hoursSinceAbandon: 999 })).toBe(true);
  });
});

describe('findStuckCarts', () => {
  beforeEach(() => vi.clearAllMocks());

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000);

  it('exclut converti + supprimé, garde les vrais coincés, flag recoverable + tri', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      // coincé, abandonné il y a 30h → RÉCUPÉRABLE (<72h)
      { id: 'stuck_recent', email: 'recent@x.ca', productId: 7, lastStep: 'shipping', emailSentAt: hoursAgo(1), updatedAt: hoursAgo(30) },
      // coincé, abandonné il y a 100h → expiré (non récupérable)
      { id: 'stuck_old', email: 'old@x.ca', productId: 7, lastStep: 'upload', emailSentAt: hoursAgo(2), updatedAt: hoursAgo(100) },
      // converti : une commande existe après l'abandon → exclu
      { id: 'converted', email: 'conv@x.ca', productId: 7, lastStep: 'shipping', emailSentAt: hoursAgo(1), updatedAt: hoursAgo(40) },
      // supprimé : email en EmailSuppression → exclu
      { id: 'suppressed', email: 'supp@x.ca', productId: 7, lastStep: 'shipping', emailSentAt: hoursAgo(1), updatedAt: hoursAgo(40) },
    ] as never);
    // commande pour conv@x.ca créée il y a 10h (donc APRÈS l'abandon il y a 40h)
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([
      { createdAt: hoursAgo(10), user: { email: 'conv@x.ca' } },
    ] as never);
    vi.mocked(prisma.emailSuppression.findMany).mockResolvedValueOnce([{ email: 'supp@x.ca' }] as never);

    const res = await findStuckCarts();

    // converted + suppressed exclus ; récupérable d'abord
    expect(res.map((c) => c.id)).toEqual(['stuck_recent', 'stuck_old']);
    expect(res[0].recoverable).toBe(true);
    expect(res[1].recoverable).toBe(false);
  });

  it('retourne [] si aucun candidat (court-circuit avant les queries de contexte)', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);
    const res = await findStuckCarts();
    expect(res).toEqual([]);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.emailSuppression.findMany).not.toHaveBeenCalled();
  });
});
