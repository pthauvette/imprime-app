/**
 * Le chemin qui porte ~100 % des commandes : `stripe-process.ts`.
 *
 * POURQUOI CE FICHIER. Le marqueur « soumission d'issue inconnue » n'existait
 * que sur le rejeu admin, qui est marginal. Le scénario du chemin principal
 * était déterministe :
 *
 *   `/order/new` expire à 15 s alors que Sinalite A CRÉÉ la commande → le
 *   `catch` tente `refunds.create`, qui échoue à son tour → `markOrderFailed`
 *   + alerte « rembourse à la main ». État final : FAILED, `paidAt` posé,
 *   `sinaliteOrderId` null, AUCUN marqueur. L'admin ouvre la fiche : rien de
 *   rouge, « Soumettre » actif. Il clique, `charges.list` rend
 *   `amount_refunded = 0` — le remboursement a échoué — tous les gardes
 *   passent. SECONDE PRODUCTION pour un seul encaissement.
 *
 * ⚠️ LES ASSERTIONS QUI COMPTENT SONT `createOrder` NON APPELÉ,
 * `refunds.create` NON APPELÉ, ET LES CLAUSES `where`. Un test sur le code de
 * retour ou sur `data` seul passerait au vert pendant qu'une écriture non
 * portée écrase le marqueur d'un autre envoi.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const m = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  orderEventCreate: vi.fn(),
  mcpIntentDeleteMany: vi.fn(),
  markOrderPaid: vi.fn(),
  markOrderPaidWithWalletDebit: vi.fn(),
  markOrderSubmitted: vi.fn(),
  markOrderFailed: vi.fn(),
  markRefundIssued: vi.fn(),
  createOrder: vi.fn(),
  sendOrderConfirmationEmail: vi.fn(),
  sendOrderCancelledEmail: vi.fn(),
  sendRefundIssuedEmail: vi.fn(),
  sendCriticalAlert: vi.fn(),
  awardReferral: vi.fn(),
  releaseReservedCreditsOnCancel: vi.fn(),
  refundsCreate: vi.fn(),
  restoreWallet: vi.fn(),
  restoreReferral: vi.fn(),
  SinaliteError: class SinaliteError extends Error {
    status: number;
    endpoint: string;
    constructor(message: string, status: number, endpoint: string) {
      super(message);
      this.name = 'SinaliteError';
      this.status = status;
      this.endpoint = endpoint;
    }
  },
}));

vi.mock('@/lib/db', () => ({ prisma: {
  order: { findUnique: m.findUnique, update: m.update, updateMany: m.updateMany },
  orderEvent: { create: m.orderEventCreate },
  mcpOrderIntent: { deleteMany: m.mcpIntentDeleteMany },
} }));
vi.mock('@/lib/db/orders', () => ({
  markOrderPaid: m.markOrderPaid,
  markOrderPaidWithWalletDebit: m.markOrderPaidWithWalletDebit,
  markOrderSubmitted: m.markOrderSubmitted,
  markOrderFailed: m.markOrderFailed,
  markRefundIssued: m.markRefundIssued,
  OrderNotFoundError: class OrderNotFoundError extends Error {},
}));
vi.mock('@/lib/emails/send', () => ({
  sendOrderConfirmationEmail: m.sendOrderConfirmationEmail,
  sendOrderCancelledEmail: m.sendOrderCancelledEmail,
  sendPaymentFailedEmail: vi.fn(),
  sendRefundIssuedEmail: m.sendRefundIssuedEmail,
}));
vi.mock('@/lib/sinalite/client', () => ({
  sinalite: { createOrder: m.createOrder },
  SinaliteError: m.SinaliteError,
}));
vi.mock('@/lib/logger', () => ({
  logStripe: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), fatal: vi.fn() },
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert: m.sendCriticalAlert }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ refunds: { create: m.refundsCreate } }) }));
vi.mock('@/lib/referrals/award', () => ({ awardReferralCreditIfEligible: m.awardReferral }));
vi.mock('@/lib/orders/credit-reservation', () => ({ releaseReservedCreditsOnCancel: m.releaseReservedCreditsOnCancel }));
vi.mock('@/lib/wallet/operations', () => ({ restoreWalletCreditOnFullRefund: m.restoreWallet }));
vi.mock('@/lib/referrals/restore', () => ({ restoreReferralCreditOnFullRefund: m.restoreReferral }));

import { processStripeEvent } from '@/lib/webhooks/stripe-process';
import { PEREMPTION_VERROU_MS } from '@/lib/orders/replay-lock';

const VALID_PAYLOAD = {
  items: [{ productId: 2, options: { Stock: '30' }, files: [{ type: 'front', url: 'https://x.s3.amazonaws.com/uploads/a.pdf' }] }],
  shippingInfo: { ShipFName: 'A', ShipLName: 'B', ShipEmail: 'a@b.ca', ShipAddr: '1 rue', ShipAddr2: '', ShipCity: 'Mtl', ShipState: 'QC', ShipZip: 'H2X1Y7', ShipCountry: 'CA', ShipPhone: '5145551234', ShipMethod: 'UPS Standard' },
  billingInfo: { BillFName: 'A', BillLName: 'B', BillEmail: 'a@b.ca', BillAddr: '1 rue', BillAddr2: '', BillCity: 'Mtl', BillState: 'QC', BillZip: 'H2X1Y7', BillCountry: 'CA', BillPhone: '5145551234' },
};

function pendingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord_zk4m2p', paymentIntentId: 'pi_1', status: 'PENDING', amountCents: 5000,
    walletCreditAppliedCents: 0, userId: 'u1', sinaliteOrderId: null,
    sinalitePayload: JSON.stringify(VALID_PAYLOAD),
    user: { id: 'u1', email: 'owner@plio.ca', name: 'Owner' },
    ...overrides,
  };
}

const succeeded = {
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_1', amount_received: 5000, metadata: {} } },
} as unknown as Stripe.Event;

/** Appels `updateMany` qui TOUCHENT au marqueur (pose ou effacement). */
const appelsMarqueur = () =>
  m.updateMany.mock.calls
    .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
    .filter((a) => 'sinaliteSubmitUncertainAt' in (a.data ?? {}));

beforeEach(() => {
  vi.clearAllMocks();
  m.findUnique.mockResolvedValue(pendingOrder());
  m.markOrderPaidWithWalletDebit.mockResolvedValue({ order: { id: 'ord_zk4m2p' }, transitioned: true });
  m.updateMany.mockResolvedValue({ count: 1 });
  m.createOrder.mockResolvedValue({ orderId: 999, message: 'ok', status: 'success' });
  m.refundsCreate.mockResolvedValue({ id: 're_1', amount: 5000 });
});

describe('la pose du marqueur PRÉCÈDE l’appel irréversible', () => {
  it('le marqueur est écrit AVANT createOrder, jamais après', async () => {
    // L'ordre est TOUT le sujet : le cas couvert est celui où le conteneur
    // meurt sans jamais atteindre la ligne suivante.
    const ordre: string[] = [];
    m.updateMany.mockImplementation(async (a: { data?: Record<string, unknown> }) => {
      if (a?.data && 'sinaliteSubmitUncertainAt' in a.data) {
        ordre.push(a.data.sinaliteSubmitUncertainAt === null ? 'efface' : 'pose');
      }
      return { count: 1 };
    });
    m.createOrder.mockImplementation(async () => {
      ordre.push('createOrder');
      return { orderId: 999, message: 'ok', status: 'success' };
    });

    await processStripeEvent(succeeded, {});

    expect(ordre[0]).toBe('pose');
    expect(ordre[1]).toBe('createOrder');
  });

  it('la clause `where` de la pose refuse une commande déjà soumise, déjà marquée, ou en vol', async () => {
    await processStripeEvent(succeeded, {});
    const pose = appelsMarqueur()[0]!;

    // Sans `sinaliteOrderId: null`, on repartirait sur une commande déjà
    // soumise. Sans `sinaliteSubmitUncertainAt: null`, on écraserait le
    // marqueur d'un rejeu en vol — et on partirait en même temps que lui.
    expect(pose.where).toMatchObject({ sinaliteOrderId: null, sinaliteSubmitUncertainAt: null });
    // Le verrou est posé EN MÊME TEMPS que le marqueur : c'est lui qui donne à
    // l'encadré admin sa fenêtre « en cours » avant « sans réponse ».
    expect(pose.data.replayClaimedAt).toBeInstanceOf(Date);
    expect(pose.data.sinaliteSubmitUncertainAt).toEqual(pose.data.replayClaimedAt);
    // …avec péremption, sinon un conteneur tué bloquerait la commande à vie.
    const or = (pose.where as { OR?: { replayClaimedAt?: unknown }[] }).OR!;
    expect(or[0]).toEqual({ replayClaimedAt: null });
    const seuil = (or[1] as { replayClaimedAt: { lt: Date } }).replayClaimedAt.lt;
    expect(Date.now() - seuil.getTime()).toBeGreaterThanOrEqual(PEREMPTION_VERROU_MS - 5_000);
  });

  it('pose refusée (count 0) → AUCUN envoi au fournisseur', async () => {
    m.updateMany.mockResolvedValue({ count: 0 });

    await processStripeEvent(succeeded, {});

    // L'assertion qui compte. Ne pas pouvoir prouver qu'on est seul, c'est ne
    // pas produire.
    expect(m.createOrder).not.toHaveBeenCalled();
    expect(m.refundsCreate).not.toHaveBeenCalled();
    expect(m.sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical' }),
    );
  });
});

describe('ISSUE INCONNUE — aucun remboursement, marqueur conservé', () => {
  const inconnues: [string, unknown][] = [
    ['délai d’attente sur /order/new', new DOMException('aborted', 'TimeoutError')],
    ['corps de réponse tronqué', new SyntaxError('Unexpected end of JSON input')],
    ['500 fournisseur', new m.SinaliteError('boom', 500, '/order/new')],
    ['409 « existe déjà »', new m.SinaliteError('exists', 409, '/order/new')],
    ['429 débit dépassé', new m.SinaliteError('rate', 429, '/order/new')],
    ['200 au schéma illisible (commande CRÉÉE, id perdu)', new m.SinaliteError('schema', 200, '/order/new')],
  ];

  it.each(inconnues)('%s → PAS de remboursement', async (_label, err) => {
    m.createOrder.mockRejectedValueOnce(err);

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    // ⚠️ LE CŒUR DU CORRECTIF. Rembourser sur un doute, c'est payer une
    // production ET rendre l'argent — puis annoncer au client une annulation
    // qui n'a pas eu lieu.
    expect(m.refundsCreate).not.toHaveBeenCalled();
    expect(m.markRefundIssued).not.toHaveBeenCalled();
    expect(m.sendOrderCancelledEmail).not.toHaveBeenCalled();
    expect(m.sendRefundIssuedEmail).not.toHaveBeenCalled();
  });

  it('le marqueur n’est PAS effacé — c’est ce qui bloque le rejeu', async () => {
    m.createOrder.mockRejectedValueOnce(new DOMException('aborted', 'TimeoutError'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    const effacements = appelsMarqueur().filter((a) => a.data.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(0);
  });

  it('trace, alerte et raison nomment l’incertitude au lieu d’affirmer un échec', async () => {
    m.createOrder.mockRejectedValueOnce(new DOMException('aborted', 'TimeoutError'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    expect(m.orderEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'SINALITE_SUBMIT_UNCERTAIN' }) }),
    );
    expect(m.markOrderFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringMatching(/issue INCONNUE/i) }),
    );
    // La référence citable au portail doit être DANS l'alerte : sans elle, on
    // demande une vérification en retenant ce qui permet de la faire.
    const alerte = m.sendCriticalAlert.mock.calls.at(-1)![0] as { severity: string; body: string };
    expect(alerte.severity).toBe('critical');
    expect(alerte.body).toContain('PLIO-ZK4M2P');
  });
});

describe('REFUS PROUVÉ avant création — le remboursement automatique subsiste', () => {
  it.each([400, 401, 403, 404, 413, 422])('/order/new en %i → remboursement', async (status) => {
    m.createOrder.mockRejectedValueOnce(new m.SinaliteError('refus', status, '/order/new'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    expect(m.refundsCreate).toHaveBeenCalledTimes(1);
  });

  it('échec de jeton (pré-envoi) → remboursement, et marqueur effacé', async () => {
    m.createOrder.mockRejectedValueOnce(new m.SinaliteError('token', 401, '/auth/token'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    expect(m.refundsCreate).toHaveBeenCalledTimes(1);
    const effacements = appelsMarqueur().filter((a) => a.data.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(1);
    // Effacement PORTÉ : sans la clause, on écraserait le marqueur tout neuf
    // d'un autre envoi — la faute même qu'on ferme, déplacée de dix lignes.
    expect(effacements[0]!.where.sinaliteSubmitUncertainAt).toBeInstanceOf(Date);
    expect(effacements[0]!.where.replayClaimedAt).toBeInstanceOf(Date);
  });
});

describe('SOUMISSION RÉUSSIE — ce qui échoue APRÈS ne doit rien rembourser', () => {
  it('le marqueur n’est effacé qu’APRÈS markOrderSubmitted', async () => {
    const ordre: string[] = [];
    m.markOrderSubmitted.mockImplementation(async () => { ordre.push('markOrderSubmitted'); });
    m.updateMany.mockImplementation(async (a: { data?: Record<string, unknown> }) => {
      if (a?.data?.sinaliteSubmitUncertainAt === null) ordre.push('efface');
      return { count: 1 };
    });

    await processStripeEvent(succeeded, {});

    // Entre `createOrder` et `markOrderSubmitted`, on connaît l'identifiant
    // sans l'avoir enregistré : l'incertitude doit survivre à cet intervalle.
    expect(ordre).toEqual(['markOrderSubmitted', 'efface']);
  });

  it('markOrderSubmitted annulée (rollback) → identifiant rattaché, AUCUN remboursement', async () => {
    m.markOrderSubmitted.mockRejectedValueOnce(new Error('transaction rolled back'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    expect(m.refundsCreate).not.toHaveBeenCalled();
    const rattachement = m.updateMany.mock.calls
      .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
      .find((a) => 'sinaliteOrderId' in (a.data ?? {}));
    expect(rattachement).toBeDefined();
    expect(rattachement!.data.sinaliteOrderId).toBe('999');
    // Le rattachement ne doit pas écraser un identifiant déjà écrit par ailleurs.
    expect(rattachement!.where).toMatchObject({ sinaliteOrderId: null });
    expect(m.sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', body: expect.stringContaining('Ne PAS relancer') }),
    );
  });

  it('⚠️ courriel de confirmation en échec → AUCUN remboursement (la régression la plus discrète)', async () => {
    // Le code précédent remboursait sur TOUTE levée. `sendOrderConfirmationEmail`
    // est DANS le `try` : un incident SES suffisait à rembourser une commande
    // dont la production était lancée, et à envoyer au client un courriel
    // d'annulation. `sinaliteOrderId` était pourtant déjà écrit.
    m.sendOrderConfirmationEmail.mockRejectedValueOnce(new Error('SES throttled'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    expect(m.refundsCreate).not.toHaveBeenCalled();
    expect(m.markRefundIssued).not.toHaveBeenCalled();
    expect(m.sendOrderCancelledEmail).not.toHaveBeenCalled();
    // …et on ne rétrograde pas non plus la commande.
    expect(m.markOrderFailed).not.toHaveBeenCalled();
    expect(m.sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warning' }),
    );
  });
});

describe('défense en profondeur — `idFournisseur === null` dans le garde', () => {
  it('soumission RÉUSSIE puis échec de forme « refus prouvé » → toujours AUCUN remboursement', async () => {
    // Aujourd'hui ces deux conditions ne peuvent pas coexister : une fois
    // `createOrder` abouti, les levées suivantes viennent de la base ou de SES,
    // jamais avec la forme d'un refus fournisseur. Mais c'est un accident
    // d'implémentation, pas un invariant — il suffirait qu'une écriture
    // postérieure passe par le client Sinalite pour que le remboursement
    // reparte sur une commande DÉJÀ EN PRODUCTION.
    //
    // Écrit après une campagne de mutation : retirer `idFournisseur === null`
    // du garde ne faisait rougir aucun test.
    m.markOrderSubmitted.mockRejectedValueOnce(new m.SinaliteError('token expiré', 401, '/auth/token'));

    await expect(processStripeEvent(succeeded, {})).rejects.toBeTruthy();

    expect(m.refundsCreate).not.toHaveBeenCalled();
    expect(m.markRefundIssued).not.toHaveBeenCalled();
    expect(m.sendOrderCancelledEmail).not.toHaveBeenCalled();
  });
});

/**
 * F1 — la conséquence en aval du marqueur : « payée, non produite, non
 * remboursée » devient un état COURANT, et c'est le seul chemin client qui y
 * encaisse une seconde fois.
 *
 * Trouvé par le money-path-reviewer, pas par la campagne de mutation : une
 * mutation modifie du code existant, elle ne fait pas apparaître un appelant
 * externe (`/payment/retry`) que le lot rend nouvellement atteignable.
 */
describe('reprise de paiement sur une commande à issue INCONNUE', () => {
  const uncertainOrder = {
    id: 'ord_zk4m2p', status: 'FAILED', paidAt: new Date(), amountCents: 5000,
    paymentIntentId: 'pi_PREMIER', walletCreditAppliedCents: 0, userId: 'u1',
    sinaliteOrderId: null, sinaliteSubmitUncertainAt: new Date(),
    sinalitePayload: JSON.stringify(VALID_PAYLOAD),
    user: { id: 'u1', email: 'owner@plio.ca', name: 'Owner' },
  };
  const secondPaiement = {
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_SECOND', amount_received: 5000, metadata: { orderId: 'ord_zk4m2p' } } },
  } as unknown as Stripe.Event;

  beforeEach(() => {
    // 1er lookup par paymentIntentId → rien (le PI n°2 n'est rattaché à rien).
    // 2e lookup par metadata.orderId → la commande marquée.
    m.findUnique.mockReset();
    m.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(uncertainOrder);
  });

  it('le second débit est REMBOURSÉ, et le premier PaymentIntent reste rattaché', async () => {
    await processStripeEvent(secondPaiement, {});

    expect(m.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_SECOND', reason: 'duplicate' }),
      expect.objectContaining({ idempotencyKey: 'uncertain_dup_pi_SECOND' }),
    );
    // ⚠️ L'ASSERTION QUI COMPTE VRAIMENT. Adopter le nouveau PI écraserait
    // `paymentIntentId` et ORPHELINERAIT le premier encaissement — celui qu'on
    // n'a justement pas remboursé. Tous les gardes en aval interrogent
    // `charges.list({ payment_intent: order.paymentIntentId })` : ils
    // verraient le mauvais paiement, et un remboursement « complet »
    // laisserait le premier débit intact et introuvable.
    expect(m.update).not.toHaveBeenCalled();
  });

  it('la commande n’est ni re-finalisée ni re-soumise', async () => {
    await processStripeEvent(secondPaiement, {});

    expect(m.markOrderPaidWithWalletDebit).not.toHaveBeenCalled();
    expect(m.createOrder).not.toHaveBeenCalled();
  });

  it('remboursement impossible → alerte CRITIQUE et levée (pas de 200 silencieux)', async () => {
    m.refundsCreate.mockRejectedValueOnce(new Error('Stripe down'));

    await expect(processStripeEvent(secondPaiement, {})).rejects.toThrow(/Stripe down/);

    expect(m.sendCriticalAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'critical', title: expect.stringContaining('DOUBLE DÉBIT') }),
    );
  });
});
