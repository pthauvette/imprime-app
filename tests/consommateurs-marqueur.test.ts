/**
 * Les routes qui lisent `status` SANS connaître le marqueur d'incertitude.
 *
 * POURQUOI CE FICHIER. La revue money-path a trouvé les deux vrais trous de ce
 * lot en regardant les CONSOMMATEURS de l'état plutôt que le code qui le
 * produit — et la famille s'est révélée récidiviste. Après `cancel` (qui
 * remboursait une production réelle), deux autres :
 *
 *   · `resend-confirmation` envoie un gabarit dont l'objet ET le titre sont
 *     « C'est imprimé! », facture jointe. Le bouton est le PREMIER du panneau,
 *     rendu sans condition, donc AU-DESSUS de l'encadré qui dit de ne rien
 *     faire. Avec le filtre `?flag=incertaine` que ce lot ajoute, le geste
 *     groupé est naturel : sélectionner tout, et N clients apprennent que leur
 *     commande est imprimée.
 *
 *   · `status` fait avancer le fulfillment. `markOrderSubmitted` n'accepte que
 *     PAID|FAILED : avancer une commande marquée rend `attach-sinalite-id`
 *     définitivement impossible. Il ne reste alors que « rien au portail »,
 *     l'attestation fausse que cette route existe pour éviter — et
 *     `sinaliteOrderId` reste nul pour toujours.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findUnique, sendConfirmation, updateMany, orderEventCreate, transaction } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  sendConfirmation: vi.fn(),
  updateMany: vi.fn(),
  orderEventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: {
  order: { findUnique, updateMany, update: vi.fn() },
  orderEvent: { create: orderEventCreate },
  $transaction: transaction,
} }));
vi.mock('@/lib/emails/send', () => ({ sendOrderConfirmationEmail: sendConfirmation }));
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({ ok: true, user: { id: 'a1', email: 'a@plio.ca' }, userId: 'a1' }),
}));
vi.mock('@/lib/db/admin-audit', () => ({ recordAdminAudit: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logAdmin: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST as RESEND } from '@/app/api/admin/orders/[id]/resend-confirmation/route';
import { POST as STATUS } from '@/app/api/admin/orders/[id]/status/route';

const ctx = { params: Promise.resolve({ id: 'ord_1' }) };
const body = (b: unknown) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  });

/** Commande PAID marquée : l'état de la branche « soumis, enregistrement échoué ». */
const marquee = {
  id: 'ord_1', status: 'PAID', paidAt: new Date(), amountCents: 5000,
  sinaliteOrderId: null, sinaliteSubmitUncertainAt: new Date(),
  user: { id: 'u1', email: 'c@x.ca' },
};

beforeEach(() => {
  vi.clearAllMocks();
  sendConfirmation.mockResolvedValue({ sent: true, id: 'em_1' });
  updateMany.mockResolvedValue({ count: 1 });
  transaction.mockResolvedValue([]);
});

describe('« Renvoyer la confirmation » n’annonce pas une impression non confirmée', () => {
  it('⚠️ commande marquée → 409, et AUCUN courriel envoyé', async () => {
    findUnique.mockResolvedValue(marquee);
    const res = await RESEND(body({}), ctx);
    expect(res.status).toBe(409);
    expect(sendConfirmation).not.toHaveBeenCalled();
  });

  it('numéro fournisseur rattaché → le courriel repart (la production EST confirmée)', async () => {
    findUnique.mockResolvedValue({ ...marquee, sinaliteOrderId: '481203' });
    const res = await RESEND(body({}), ctx);
    expect(res.status).toBe(200);
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
  });

  it('commande ordinaire → inchangé (non-régression)', async () => {
    findUnique.mockResolvedValue({ ...marquee, sinaliteSubmitUncertainAt: null, sinaliteOrderId: '999' });
    const res = await RESEND(body({}), ctx);
    expect(res.status).toBe(200);
    expect(sendConfirmation).toHaveBeenCalledTimes(1);
  });
});

describe('« Faire avancer » ne supprime pas la seule résolution correcte', () => {
  it('⚠️ commande marquée → 409, aucune transition écrite', async () => {
    findUnique.mockResolvedValue(marquee);
    const res = await STATUS(body({ status: 'IN_PRODUCTION' }), ctx);
    expect(res.status).toBe(409);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('numéro rattaché → la commande peut avancer normalement', async () => {
    findUnique.mockResolvedValue({ ...marquee, sinaliteOrderId: '481203' });
    const res = await STATUS(body({ status: 'IN_PRODUCTION' }), ctx);
    expect(res.status).not.toBe(409);
  });

  it('commande ordinaire → inchangé (non-régression)', async () => {
    findUnique.mockResolvedValue({ ...marquee, sinaliteSubmitUncertainAt: null });
    const res = await STATUS(body({ status: 'IN_PRODUCTION' }), ctx);
    expect(res.status).not.toBe(409);
  });
});
