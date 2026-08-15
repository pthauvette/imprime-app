/**
 * `/api/admin/orders/[id]/cancel` face à une soumission d'issue inconnue.
 *
 * POURQUOI CE FICHIER. C'est la route qui rend l'argent SANS que l'admin soit
 * passé par l'encadré de vérification, et elle ne lisait pas le marqueur. Le
 * scénario est un clic, pas une course :
 *
 *   `/order/new` répond `{ orderId: 481203 }` — la presse est lancée — puis la
 *   transaction de `markOrderSubmitted` est annulée (coupure du pooler). Le
 *   rattachement automatique échoue aussi : le marqueur reste, l'identifiant
 *   est perdu de la base, et la commande demeure **PAID** (cette branche
 *   n'appelle pas `markOrderFailed`). `canCancel` est donc vrai, et le bouton
 *   « Annuler » s'affiche juste sous l'encadré rouge.
 *
 *   Clic : remboursement intégral + restauration wallet + referral, avec des
 *   frais d'annulation à ZÉRO — ils ne s'appliquent qu'à SUBMITTED/
 *   IN_PRODUCTION, or le statut est resté PAID. Plio paie l'impression et rend
 *   tout l'argent, même quand l'admin coche « répercuter les frais ».
 *
 * ⚠️ L'ASSERTION QUI COMPTE EST `refunds.create` NON APPELÉ, pas le code HTTP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUnique, refundsCreate, updateMany, orderEventCreate, transaction } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  refundsCreate: vi.fn(),
  updateMany: vi.fn(),
  orderEventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: {
  order: { findUnique, updateMany, update: vi.fn() },
  orderEvent: { create: orderEventCreate, count: vi.fn() },
  $transaction: transaction,
} }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ refunds: { create: refundsCreate } }) }));
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({ ok: true, user: { id: 'a1', email: 'a@plio.ca' }, userId: 'a1' }),
}));
vi.mock('@/lib/db/admin-audit', () => ({ recordAdminAudit: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/emails/send', () => ({
  sendOrderCancelledEmail: vi.fn(),
  sendRefundIssuedEmail: vi.fn(),
}));
vi.mock('@/lib/db/orders', () => ({ markRefundIssued: vi.fn(), markOrderCancelled: vi.fn() }));
vi.mock('@/lib/wallet/operations', () => ({ restoreWalletCreditOnFullRefund: vi.fn() }));
vi.mock('@/lib/referrals/restore', () => ({ restoreReferralCreditOnFullRefund: vi.fn() }));

import { POST } from '@/app/api/admin/orders/[id]/cancel/route';

const ctx = { params: Promise.resolve({ id: 'ord_1' }) };
const req = (body: unknown) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  refundsCreate.mockResolvedValue({ id: 're_1', amount: 5000 });
});

describe('annulation d’une commande dont la production est peut-être lancée', () => {
  it('⚠️ PAID + marqueur → REFUS, et AUCUN remboursement émis', async () => {
    findUnique.mockResolvedValue({
      id: 'ord_1', status: 'PAID', paidAt: new Date(), amountCents: 5000,
      paymentIntentId: 'pi_1', itemsCount: 1, sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date(), user: { id: 'u1', email: 'c@x.ca' },
    });

    const res = await POST(req({ reason: 'Stock épuisé' }), ctx);

    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('même avec « répercuter les frais » coché — les frais valent ZÉRO sur PAID', async () => {
    findUnique.mockResolvedValue({
      id: 'ord_1', status: 'PAID', paidAt: new Date(), amountCents: 5000,
      paymentIntentId: 'pi_1', itemsCount: 3, sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date(), user: { id: 'u1', email: 'c@x.ca' },
    });

    const res = await POST(req({ reason: 'x', chargeCancelFee: true }), ctx);

    expect(res.status).toBe(409);
    expect(refundsCreate).not.toHaveBeenCalled();
  });

  it('le message renvoie vers la fiche, pas vers une impasse', async () => {
    findUnique.mockResolvedValue({
      id: 'ord_1', status: 'PAID', paidAt: new Date(), amountCents: 5000,
      paymentIntentId: 'pi_1', itemsCount: 1, sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date(), user: { id: 'u1', email: 'c@x.ca' },
    });
    const res = await POST(req({ reason: 'x' }), ctx);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rattacher/i);
    expect(body.error).toMatch(/portail/i);
  });
});

describe('non-régression — l’annulation ordinaire reste possible', () => {
  it('PAID sans marqueur → l’annulation suit son cours', async () => {
    findUnique.mockResolvedValue({
      id: 'ord_1', status: 'PAID', paidAt: new Date(), amountCents: 5000,
      paymentIntentId: 'pi_1', itemsCount: 1, sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: null, user: { id: 'u1', email: 'c@x.ca' },
    });

    const res = await POST(req({ reason: 'Stock épuisé' }), ctx);

    // Le garde ne doit pas déborder : sans marqueur, on rembourse comme avant.
    expect(res.status).not.toBe(409);
    expect(refundsCreate).toHaveBeenCalledTimes(1);
  });
});
