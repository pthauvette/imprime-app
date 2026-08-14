/**
 * Les deux gardes qui empêchent d'imprimer sans contrepartie encaissée.
 *
 * POURQUOI CE FICHIER. `replay-sinalite` ne vérifiait NI le paiement NI le
 * remboursement. Deux chemins déterministes, un seul admin, un seul clic :
 *
 *   1. Le client abandonne au 3-D Secure → `payment_intent.payment_failed` →
 *      la commande passe FAILED avec `paidAt = null`. L'admin voit « Échec »
 *      dans la liste — le cas d'usage n°1 documenté de ce bouton — et clique.
 *      Production réelle facturée à Plio, zéro dollar encaissé.
 *   2. L'auto-refund rembourse intégralement puis marque FAILED. C'est la
 *      population MAJORITAIRE des commandes FAILED sans `sinaliteOrderId`.
 *      Rejouer, c'est payer l'impression ET avoir rendu l'argent.
 *
 * ⚠️ L'ASSERTION QUI COMPTE EST `createOrder` NON APPELÉ, pas le code HTTP.
 * Un futur refactor qui renverrait le bon statut APRÈS avoir soumis passerait
 * un test sur le code de retour et laisserait la presse tourner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOrder = vi.fn();
const findUnique = vi.fn();
const chargesList = vi.fn();
const updateMany = vi.fn();

class SinaliteError extends Error {
  constructor(message: string, public status: number, public endpoint: string) {
    super(message);
    this.name = 'SinaliteError';
  }
}
vi.mock('@/lib/sinalite/client', () => ({ sinalite: { createOrder }, SinaliteError }));

/** Instantané minimal valide, pour atteindre réellement `createOrder`. */
const payloadValide = {
  items: [{ productId: 1, options: { qty: '50' }, files: [{ type: 'front', url: 'https://s3/a.pdf' }] }],
  shippingInfo: {
    ShipFName: 'A', ShipLName: 'B', ShipEmail: 'a@b.ca', ShipAddr: '1 rue', ShipAddr2: '',
    ShipCity: 'Mtl', ShipState: 'QC', ShipZip: 'H2X1Y7', ShipCountry: 'CA',
    ShipPhone: '5145551234', ShipMethod: 'UPS Standard',
  },
  billingInfo: {
    BillFName: 'A', BillLName: 'B', BillEmail: 'a@b.ca', BillAddr: '1 rue', BillAddr2: '',
    BillCity: 'Mtl', BillState: 'QC', BillZip: 'H2X1Y7', BillCountry: 'CA', BillPhone: '5145551234',
  },
};
vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique, updateMany }, orderEvent: { create: vi.fn() } } }));
// ⚠️ FORME EXACTE de `requireAdmin` : `{ ok, user, userId }` — PAS
// `{ ok, session }`. Le mock précédent mentait, donc la route levait un
// TypeError sur `guard.user.email` AVANT d'atteindre le comportement que
// chaque titre de test annonçait. `withErrorHandler` avalait la levée en 500,
// les tests faisaient `.catch(() => {})` et n'assertaient aucun statut :
// la preuve était décorative. C'est le mécanisme exact de #357.
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({
    ok: true,
    user: { id: 'admin1', email: 'a@plio.ca' },
    userId: 'admin1',
  }),
}));
vi.mock('@/lib/db/admin-audit', () => ({ recordAdminAudit: vi.fn() }));
vi.mock('@/lib/emails/send', () => ({ sendOrderConfirmationEmail: vi.fn() }));
vi.mock('@/lib/db/orders', () => ({ markOrderSubmitted: vi.fn(), markOrderFailed: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ charges: { list: chargesList } }) }));

const { POST } = await import('@/app/api/admin/orders/[id]/replay-sinalite/route');

const commande = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  status: 'FAILED',
  paidAt: new Date('2026-08-01'),
  amountCents: 34000,
  paymentIntentId: 'pi_1',
  sinaliteOrderId: null,
  skipSinaliteSubmission: false,
  sinalitePayload: '{}',
  user: { email: 'c@example.com' },
  ...over,
});

const appeler = () => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'o1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  chargesList.mockResolvedValue({ data: [] });
  // Par défaut le verrou est OBTENU (count 1).
  updateMany.mockResolvedValue({ count: 1 });
});

describe('commande jamais encaissée', () => {
  it('refuse SANS rien soumettre', async () => {
    findUnique.mockResolvedValue(commande({ paidAt: null }));
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});

describe('commande remboursée', () => {
  it('remboursement INTÉGRAL : refuse sans rien soumettre', async () => {
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 34000, disputed: false }] });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });

  it('remboursement PARTIEL : refuse aussi, et le dit honnêtement', async () => {
    // Fail-closed : la sanction d'un faux négatif est « imprimer gratuitement ».
    // Mais le message ne doit plus prétendre « sans contrepartie ».
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 1500, disputed: false }] });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    // Formatage fr-CA (virgule décimale, espace insécable) : l'assertion
    // initiale attendait « 15,00 $ » alors que `.toFixed(2)` rendait « 15.00 ».
    const { error } = await res.json();
    expect(error).toMatch(/15,00/);
    expect(error).toMatch(/340,00/);
    expect(error).toMatch(/décision manuelle/);
  });

  it("aucun remboursement ni contestation : rien ne bloque", async () => {
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 0, disputed: false }] });
    const res = await appeler();
    // ⚠️ L'ASSERTION QUI COMPTE est « pas de 409 ». La première version
    // vérifiait `refundsList` appelé — or si quelqu'un retirait le
    // `.filter(failed|canceled)`, la régression EXACTE que ce cas existe pour
    // attraper, `refundsList` serait toujours appelé et le test resterait vert.
    expect(res.status).not.toBe(409);
  });

  it('Stripe injoignable : fail-closed, on ne produit pas', async () => {
    // Ne pas savoir, c'est ne pas produire.
    findUnique.mockResolvedValue(commande());
    chargesList.mockRejectedValue(new Error('stripe down'));
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
  });
});

describe('contestation de carte (chargeback)', () => {
  it('une charge contestée bloque, même sans remboursement', async () => {
    // Scénario fabriqué par NOTRE runbook : soumission échouée, auto-refund
    // échoué lui aussi, alerte qui demande une intervention manuelle, client
    // sans nouvelles qui conteste auprès de sa banque. Stripe retient le
    // montant ET les frais. `refunds.list` ne voyait rien : une contestation
    // n'est pas un remboursement. `charges.list` expose `disputed`.
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 0, disputed: true }] });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/CONTESTÉ/);
  });
});

describe('verrou atomique du rejeu', () => {
  it('un second rejeu concurrent est refusé sans rien soumettre', async () => {
    // Le garde `sinaliteOrderId` est un read-then-act : deux requêtes le
    // franchissent toutes deux. Seul l'`updateMany` conditionnel départage.
    findUnique.mockResolvedValue(commande());
    updateMany.mockResolvedValue({ count: 0 });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/déjà en cours/);
  });

  it('le verrou est posé AVANT la vérification Stripe — donc deux REJEUX ne peuvent pas lire chacun puis soumettre', async () => {
    // ⚠️ Nom corrigé : la version précédente disait « ferme la fenêtre TOCTOU »,
    // ce qui est FAUX et gravait la fausse garantie dans la suite de tests.
    // Ni /api/admin/orders/[id]/refund ni le Dashboard Stripe ne lisent
    // `replayClaimedAt` : un remboursement peut toujours se glisser entre
    // notre lecture et l'envoi. Ce que l'ordre ferme, c'est rejeu contre
    // rejeu.
    findUnique.mockResolvedValue(commande());
    const ordre: string[] = [];
    updateMany.mockImplementation(async () => { ordre.push('verrou'); return { count: 1 }; });
    chargesList.mockImplementation(async () => { ordre.push('stripe'); return { data: [] }; });
    await appeler();
    expect(ordre[0]).toBe('verrou');
    expect(ordre).toContain('stripe');
  });

  it('un refus LIBÈRE le verrou — sinon un rejeu légitime resterait bloqué', async () => {
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 34000, disputed: false }] });
    await appeler();
    // Deux appels : la prise, puis la libération.
    expect(updateMany).toHaveBeenCalledTimes(2);
    const dernier = updateMany.mock.calls.at(-1)![0];
    expect(dernier.data).toEqual({ replayClaimedAt: null });
  });

  it('la prise de verrou exige sinaliteOrderId null ET un verrou libre ou périmé', async () => {
    findUnique.mockResolvedValue(commande());
    await appeler();
    const prise = updateMany.mock.calls[0]![0];
    expect(prise.where.sinaliteOrderId).toBeNull();
    expect(prise.where.OR).toHaveLength(2);
    // Péremption : sans elle, une Lambda interrompue bloquerait la commande
    // pour toujours, sur une route dont l'objet est de réessayer.
    expect(prise.where.OR[1].replayClaimedAt.lt).toBeInstanceOf(Date);
  });
});

describe("asymétrie de la libération — l'invariant qu'un refactor va vouloir « nettoyer »", () => {
  it('un SUCCÈS ne libère pas le verrou', async () => {
    // `sinaliteOrderId` prend le relais. Libérer ici n'aurait aucun sens, mais
    // rien ne l'épinglait.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71204 });
    const res = await appeler();
    // Le statut ASSERTÉ : sans lui, une explosion du handler passait pour un
    // succès et le test ne prouvait rien.
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, sinaliteOrderId: 71204 });
    const liberations = updateMany.mock.calls.filter((c) => c[0].data?.replayClaimedAt === null);
    expect(liberations).toHaveLength(0);
  });

  it("un échec APRÈS l'envoi ne libère pas — l'issue est inconnue", async () => {
    // Un délai d'attente sur la réponse laisse une commande bien réelle chez
    // le fournisseur. Libérer autoriserait un second clic à produire deux fois.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('timeout', 504, '/order/new'));
    const res = await appeler();
    expect(res.status).toBe(502);
    const liberations = updateMany.mock.calls.filter((c) => c[0].data?.replayClaimedAt === null);
    expect(liberations).toHaveLength(0);
  });

  it('un échec PRÉ-ENVOI libère — sinon cinq minutes de blocage pour rien', async () => {
    // Identifiants fournisseur expirés : /auth/token répond 401, aucun paquet
    // n'a atteint /order/new. C'est le rejeu raté le plus banal.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('unauthorized', 401, '/auth/token'));
    const res = await appeler();
    expect(res.status).toBe(502);
    const liberations = updateMany.mock.calls.filter((c) => c[0].data?.replayClaimedAt === null);
    expect(liberations).toHaveLength(1);
  });

  it('une libération ne peut effacer QUE son propre verrou', async () => {
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 34000, disputed: false }] });
    await appeler();
    const prise = updateMany.mock.calls[0]![0];
    const liberation = updateMany.mock.calls.at(-1)![0];
    // ⚠️ Comparer à la valeur RÉELLEMENT écrite à la prise. `toBeInstanceOf(Date)`
    // était satisfait par `where: { replayClaimedAt: new Date() }` — c'est-à-dire
    // précisément la régression que ce test doit empêcher.
    expect(liberation.where.replayClaimedAt).toBe(prise.data.replayClaimedAt);
  });
});

describe('sémantique des remboursements', () => {
  it('un remboursement en attente compte (fail-closed)', async () => {
    // `amount_refunded` est incrémenté dès la création du refund, avant
    // règlement. C'est le sens qu'on veut : dans le doute, on ne produit pas.
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({ data: [{ amount_refunded: 34000, disputed: false }] });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });

  it('plusieurs charges pour un même paiement sont sommées', async () => {
    // Chaque tentative atteignant le réseau carte crée une Charge ; les
    // échouées portent amount_refunded = 0.
    findUnique.mockResolvedValue(commande());
    chargesList.mockResolvedValue({
      data: [{ amount_refunded: 0, disputed: false }, { amount_refunded: 1500, disputed: false }],
    });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect((await res.json()).error).toMatch(/15,00/);
  });
});
