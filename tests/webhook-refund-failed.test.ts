/**
 * `charge.refund.updated` et `charge.dispute.created` — les deux événements
 * Stripe qui disent que l'argent n'est pas là où nos tableaux le croient.
 *
 * POURQUOI CE FICHIER. `markRefundIssued` est appelé à la CRÉATION du refund,
 * qui répond `pending`. Stripe peut le passer à `failed` des jours plus tard —
 * carte fermée, banque qui refuse le retour — et l'argent revient sur le compte
 * Plio. Aucun des six handlers existants ne concernait le statut d'un
 * remboursement : le client attendait son argent pendant que tout affichait
 * « remboursé », et l'encadré « encaissé non réconcilié » calculait
 * `montant − montant = 0` puis ÉCARTAIT la ligne.
 *
 * ⚠️ CE QUI COMPTE ICI : l'événement de reprise est ÉCRIT (c'est lui qui rend
 * l'argent à la réconciliation), il n'est écrit QU'UNE FOIS, et les issues non
 * terminales ne produisent rien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const m = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderEventFindFirst: vi.fn(),
  orderEventCreate: vi.fn(),
  sendCriticalAlert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: {
  order: { findUnique: m.orderFindUnique, update: vi.fn(), updateMany: vi.fn() },
  orderEvent: { findFirst: m.orderEventFindFirst, create: m.orderEventCreate },
  mcpOrderIntent: { deleteMany: vi.fn() },
} }));
vi.mock('@/lib/db/orders', () => ({
  markOrderPaid: vi.fn(), markOrderPaidWithWalletDebit: vi.fn(), markOrderSubmitted: vi.fn(),
  markOrderFailed: vi.fn(), markRefundIssued: vi.fn(),
  OrderNotFoundError: class extends Error {},
}));
vi.mock('@/lib/emails/send', () => ({
  sendOrderConfirmationEmail: vi.fn(), sendOrderCancelledEmail: vi.fn(),
  sendPaymentFailedEmail: vi.fn(), sendRefundIssuedEmail: vi.fn(),
}));
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { createOrder: vi.fn() }, SinaliteError: class extends Error {} }));
vi.mock('@/lib/logger', () => ({
  logStripe: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: m.sendCriticalAlert }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ refunds: { create: vi.fn() }, subscriptions: { retrieve: vi.fn() } }) }));
vi.mock('@/lib/referrals/award', () => ({ awardReferralCreditIfEligible: vi.fn() }));
vi.mock('@/lib/orders/credit-reservation', () => ({ releaseReservedCreditsOnCancel: vi.fn() }));

import { processStripeEvent } from '@/lib/webhooks/stripe-process';

const commande = { id: 'ord_zk4m2p', amountCents: 89000 };

function evtRefund(over: Partial<Stripe.Refund> = {}): Stripe.Event {
  return {
    type: 'charge.refund.updated',
    data: { object: { id: 're_1', status: 'failed', amount: 89000, payment_intent: 'pi_1', failure_reason: 'expired_or_canceled', ...over } },
  } as unknown as Stripe.Event;
}
function evtDispute(over: Record<string, unknown> = {}): Stripe.Event {
  return {
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_1', amount: 89000, reason: 'fraudulent', payment_intent: 'pi_1', ...over } },
  } as unknown as Stripe.Event;
}

/** Événements écrits par le handler (hors lectures d'idempotence). */
const ecrits = () => m.orderEventCreate.mock.calls.map((c) => c[0].data as { kind: string; data: string });

beforeEach(() => {
  vi.clearAllMocks();
  // Rattachement par `refundId` : l'OrderEvent REFUND_ISSUED existe.
  m.orderEventFindFirst.mockImplementation(async (args: { where?: { kind?: string } }) =>
    args?.where?.kind === 'REFUND_ISSUED' ? { order: commande } : null,
  );
  m.orderFindUnique.mockResolvedValue(commande);
});

describe('remboursement passé à FAILED', () => {
  it('écrit un REFUND_FAILED portant le refundId et le montant', async () => {
    await processStripeEvent(evtRefund(), {});
    const e = ecrits()[0]!;
    expect(e.kind).toBe('REFUND_FAILED');
    // Le `refundId` est la clé de rapprochement du module comptable : sans
    // lui, l'écriture ne rend l'argent à personne.
    expect(JSON.parse(e.data)).toMatchObject({ refundId: 're_1', amountCents: 89000 });
  });

  it('alerte en CRITICAL, et dit de contacter le client', async () => {
    // Aucun courriel automatique n'existe pour cet échec : le client a reçu
    // « Remboursement : X $ » et n'aura rien d'autre. L'alerte est le seul
    // endroit où ce geste est demandé.
    await processStripeEvent(evtRefund(), {});
    const a = m.sendCriticalAlert.mock.calls.at(-1)![0] as { severity: string; body: string };
    expect(a.severity).toBe('critical');
    expect(a.body).toMatch(/contacte-le/i);
    expect(a.body).toContain('PLIO-ZK4M2P');
  });

  it('status `canceled` est traité comme `failed`', async () => {
    await processStripeEvent(evtRefund({ status: 'canceled' }), {});
    expect(ecrits()).toHaveLength(1);
  });

  it.each(['succeeded', 'pending', 'requires_action'])(
    '⚠️ status `%s` → AUCUNE écriture, aucune alerte',
    async (status) => {
      // Un refund qui aboutit ne change rien à ce qu'on a déjà enregistré.
      // Écrire ici réintégrerait de l'argent réellement rendu.
      await processStripeEvent(evtRefund({ status: status as Stripe.Refund['status'] }), {});
      expect(m.orderEventCreate).not.toHaveBeenCalled();
      expect(m.sendCriticalAlert).not.toHaveBeenCalled();
    },
  );
});

describe('idempotence — un rejeu ne doit pas compter l’argent deux fois', () => {
  it('un REFUND_FAILED déjà présent → rien de plus', async () => {
    // La dédup du webhook porte sur `event.id` ; un rejeu depuis
    // /admin/webhooks ou deux events décrivant la même transition repasseraient
    // ici. Deux `REFUND_FAILED` feraient compter l'argent deux fois.
    m.orderEventFindFirst.mockImplementation(async (args: { where?: { kind?: string } }) => {
      if (args?.where?.kind === 'REFUND_ISSUED') return { order: commande };
      if (args?.where?.kind === 'REFUND_FAILED') return { id: 'evt_deja' };
      return null;
    });
    await processStripeEvent(evtRefund(), {});
    expect(m.orderEventCreate).not.toHaveBeenCalled();
    expect(m.sendCriticalAlert).not.toHaveBeenCalled();
  });
});

describe('rattachement de la commande', () => {
  it('privilégie le refundId au paymentIntentId', async () => {
    // `paymentIntentId` est RÉÉCRIT par le fallback de reprise de paiement :
    // le rattachement par `refundId` est le seul qui survive.
    await processStripeEvent(evtRefund(), {});
    expect(m.orderFindUnique).not.toHaveBeenCalled();
    expect(ecrits()[0]!.kind).toBe('REFUND_FAILED');
  });

  it('retombe sur le paymentIntentId quand aucun REFUND_ISSUED n’existe', async () => {
    // Cas du remboursement créé directement au dashboard Stripe.
    m.orderEventFindFirst.mockResolvedValue(null);
    await processStripeEvent(evtRefund(), {});
    expect(m.orderFindUnique).toHaveBeenCalledTimes(1);
    expect(ecrits()[0]!.kind).toBe('REFUND_FAILED');
  });

  it('commande introuvable → alerte, et surtout AUCUNE levée', async () => {
    // Lever ferait rejouer Stripe sans fin sur un événement qu'on ne saura
    // jamais rattacher.
    m.orderEventFindFirst.mockResolvedValue(null);
    m.orderFindUnique.mockResolvedValue(null);
    await expect(processStripeEvent(evtRefund(), {})).resolves.toBeUndefined();
    expect(m.orderEventCreate).not.toHaveBeenCalled();
    expect(m.sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' }),
    );
  });
});

describe('contestation bancaire', () => {
  it('écrit un PAYMENT_DISPUTED et alerte sur le DÉLAI', async () => {
    m.orderEventFindFirst.mockResolvedValue(null);
    await processStripeEvent(evtDispute(), {});
    const e = ecrits()[0]!;
    expect(e.kind).toBe('PAYMENT_DISPUTED');
    expect(JSON.parse(e.data)).toMatchObject({ disputeId: 'dp_1', amountCents: 89000 });
    const a = m.sendCriticalAlert.mock.calls.at(-1)![0] as { severity: string; body: string };
    expect(a.severity).toBe('critical');
    // Sans réponse avant l'échéance, le litige est perdu par forfait.
    expect(a.body).toMatch(/échéance|forfait/i);
  });

  it('⚠️ n’écrit AUCUN REFUND_FAILED — un litige n’est pas un remboursement', async () => {
    // Stripe RETIENT le montant en attendant l'issue, qui peut être gagnée.
    // Le compter comme rendu supposerait une perte qui n'est pas acquise.
    m.orderEventFindFirst.mockResolvedValue(null);
    await processStripeEvent(evtDispute(), {});
    expect(ecrits().some((e) => e.kind === 'REFUND_FAILED')).toBe(false);
  });

  it('rejeu → une seule trace', async () => {
    m.orderEventFindFirst.mockImplementation(async (args: { where?: { kind?: string } }) =>
      args?.where?.kind === 'PAYMENT_DISPUTED' ? { id: 'evt_deja' } : null,
    );
    await processStripeEvent(evtDispute(), {});
    expect(m.orderEventCreate).not.toHaveBeenCalled();
  });
});

describe('M2 — le rattachement doit vraiment porter sur le refundId', () => {
  it('la clause `where` contient `data: { contains: <refundId> }`', () => {
    // Sans cette assertion, supprimer le `contains` laissait toute la suite
    // VERTE — alors qu'en prod le handler rattacherait le `REFUND_FAILED` au
    // `REFUND_ISSUED` le plus récent de N'IMPORTE QUELLE commande
    // (`orderBy: createdAt desc`, aucun filtre) : la ligne de réconciliation
    // d'une commande étrangère se rouvrirait pendant que la vraie reste fermée.
    return processStripeEvent(evtRefund(), {}).then(() => {
      expect(m.orderEventFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            kind: 'REFUND_ISSUED',
            data: { contains: 're_1' },
          }),
        }),
      );
    });
  });
});

describe('M3 — un litige introuvable reste une urgence', () => {
  it('severity CRITICAL, pas warning', async () => {
    // Le rattachement d'un litige n'a qu'une ancre : `paymentIntentId`, la clé
    // même que le fallback de reprise de paiement réécrit. Quand elle rate, ce
    // qui se perd est un DÉLAI DE RÉPONSE : sans réponse avant l'échéance, le
    // litige est perdu par forfait. Le signaler au niveau le plus bas serait
    // l'enterrer.
    m.orderEventFindFirst.mockResolvedValue(null);
    m.orderFindUnique.mockResolvedValue(null);
    await processStripeEvent(evtDispute(), {});
    const a = m.sendCriticalAlert.mock.calls.at(-1)![0] as { severity: string };
    expect(a.severity).toBe('critical');
  });
});
