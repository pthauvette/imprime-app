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
const update = vi.fn();
const orderEventCreate = vi.fn();
const sendCriticalAlert = vi.fn();

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
vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique, updateMany, update }, orderEvent: { create: orderEventCreate } } }));
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
vi.mock('@/lib/alerting/slack', () => ({ sendCriticalAlert }));
vi.mock('@/lib/emails/send', () => ({ sendOrderConfirmationEmail: vi.fn() }));
const markOrderSubmitted = vi.fn();
const markOrderFailed = vi.fn();
vi.mock('@/lib/db/orders', () => ({ markOrderSubmitted, markOrderFailed }));
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
  update.mockResolvedValue({});
  orderEventCreate.mockResolvedValue({});
  markOrderSubmitted.mockResolvedValue({});
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

describe("marqueur durable « /order/new émis, issue inconnue »", () => {
  it('bloque le rejeu, sans même regarder Stripe', async () => {
    // Le verrou d'exécution EXPIRE ; ce marqueur-ci, non. C'est toute la
    // différence : une minuterie rendait le droit de produire une seconde fois.
    findUnique.mockResolvedValue(commande({ sinaliteSubmitUncertainAt: new Date('2026-08-12T10:00:00Z') }));
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/portail Sinalite/i);
  });

  it('est posé AVANT l’appel — sinon il ne servirait à rien', async () => {
    // Le cas couvert est celui où le processus MEURT pendant l'appel : poser
    // le marqueur après n'aurait jamais lieu.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    const ordre: string[] = [];
    updateMany.mockImplementation(async (a: { data: Record<string, unknown> }) => {
      if ('sinaliteSubmitUncertainAt' in a.data) {
        ordre.push(a.data.sinaliteSubmitUncertainAt ? 'pose' : 'efface');
      }
      return { count: 1 };
    });
    createOrder.mockImplementation(async () => { ordre.push('envoi'); return { orderId: 71204 }; });
    await appeler();
    expect(ordre[0]).toBe('pose');
    expect(ordre.indexOf('pose')).toBeLessThan(ordre.indexOf('envoi'));
  });

  it("markOrderSubmitted échoué : on RATTACHE l'id, et on ne lève qu'alors", async () => {
    // ⚠️ Ce test encodait d'abord une croyance FAUSSE — « l'issue est connue,
    // donc pas de blocage ». Or `markOrderSubmitted` écrit statut ET id dans
    // une seule transaction : si elle lève, elle ROLLBACK, et `sinaliteOrderId`
    // reste nul. Effacer le marqueur rendait alors le bouton cliquable après
    // péremption → deuxième production. Le test verrouillait le bug.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new Error('transition invalide'));
    await appeler();

    // On tente de rattacher l'id — c'est la seule chose qui empêche un second envoi.
    const rattachements = updateMany.mock.calls.filter((c) => 'sinaliteOrderId' in (c[0].data ?? {}));
    expect(rattachements).toHaveLength(1);
    expect(rattachements[0]![0].data.sinaliteOrderId).toBe('71400');
    // Rattachement réussi (count 1 par défaut) → le marqueur peut tomber.
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(1);
    // L'alerte nomme l'id et dit de NE PAS relancer.
    const alerte = sendCriticalAlert.mock.calls[0]![0];
    expect(alerte.body).toMatch(/71400/);
    expect(alerte.body).toMatch(/Ne PAS relancer/i);
  });

  it('une commande SOUMISE ne peut plus être rétrogradée en FAILED', async () => {
    // `ALLOWED_PRIOR_STATUSES.FAILED` autorise SUBMITTED→FAILED : rien
    // n'empêchait de marquer échouée une commande dont la presse tourne.
    findUnique.mockResolvedValue(
      commande({ status: 'FAILED', sinalitePayload: JSON.stringify(payloadValide) }),
    );
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new Error('transition invalide'));
    await appeler();
    expect(markOrderFailed).not.toHaveBeenCalled();
  });

  it('un échec APRÈS envoi LAISSE le marqueur et alerte', async () => {
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('timeout', 504, '/order/new'));
    await appeler();
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(0);
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(orderEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'SINALITE_SUBMIT_UNCERTAIN' }) }),
    );
  });

  it('un échec PRÉ-ENVOI efface le marqueur et n’alerte pas', async () => {
    // Rien n'est parti : ni verrou ni incertitude n'ont lieu d'être, et une
    // alerte critique pour des identifiants expirés serait du bruit.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('unauthorized', 401, '/auth/token'));
    await appeler();
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(1);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('un SUCCÈS confirmé efface le marqueur', async () => {
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71204 });
    const res = await appeler();
    expect(res.status).toBe(200);
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(1);
  });
});

describe("les clauses `where` — ce que 30 tests verts ne prouvaient pas", () => {
  /**
   * Les assertions précédentes lisaient `c[0].data` et jamais `c[0].where`.
   * Trois mutations passaient donc au vert en produisant une DOUBLE PRODUCTION
   * réelle : pose non portée sur `prisAt`, garde `pose.count === 0` retirée,
   * péremption abaissée sous le plancher documenté.
   */
  const posesDuMarqueur = () =>
    updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt instanceof Date);

  it('la pose du marqueur est portée par le propriétaire du verrou', async () => {
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71204 });
    await appeler();
    const prise = updateMany.mock.calls[0]![0];
    const pose = posesDuMarqueur()[0]![0];
    expect(pose.where.replayClaimedAt).toBe(prise.data.replayClaimedAt);
  });

  it("la pose RÉAFFIRME `sinaliteOrderId: null` — 20 s séparent la prise de l'envoi", async () => {
    // Entre la prise et la pose s'intercale `charges.list`. Le webhook Stripe
    // peut écrire l'id pendant ce temps : sans cette clause, on soumettait une
    // commande déjà soumise.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71204 });
    await appeler();
    expect(posesDuMarqueur()[0]![0].where.sinaliteOrderId).toBeNull();
  });

  it('perdre le verrou entre la prise et la pose ANNULE la soumission', async () => {
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    updateMany.mockImplementation(async (a: { data: Record<string, unknown> }) =>
      a.data?.sinaliteSubmitUncertainAt instanceof Date ? { count: 0 } : { count: 1 },
    );
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });

  it("l'effacement du marqueur est porté par la pose qu'on a faite", async () => {
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71204 });
    await appeler();
    const pose = posesDuMarqueur()[0]![0];
    const effacement = updateMany.mock.calls.find((c) => c[0].data?.sinaliteSubmitUncertainAt === null)![0];
    expect(effacement.where.sinaliteSubmitUncertainAt).toBe(pose.data.sinaliteSubmitUncertainAt);
  });

  it('la péremption reste au-dessus de son plancher documenté', async () => {
    // Elle borne le temps pendant lequel un envoi peut être en vol. Sous la
    // somme des délais enfermés dans le verrou (charges.list 20 s + jeton 10 s
    // + /order/new 15 s), le verrou périme pendant que l'appel court encore.
    const { PEREMPTION_VERROU_MS } = await import('@/lib/orders/replay-lock');
    expect(PEREMPTION_VERROU_MS).toBeGreaterThan(45_000);
  });
});

describe("B1 — soumission réussie mais NON enregistrée", () => {
  it("garde le marqueur si le rattachement de l'id échoue", async () => {
    // `markOrderSubmitted` lève → sa transaction ROLLBACK → `sinaliteOrderId`
    // reste nul. Effacer le marqueur ici rendait le bouton cliquable après
    // péremption : deuxième production.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new Error('transition invalide'));
    updateMany.mockImplementation(async (a: { data: Record<string, unknown> }) =>
      'sinaliteOrderId' in a.data ? { count: 0 } : { count: 1 },
    );
    await appeler();
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(0);
  });

  it("met l'id dans l'ÉVÉNEMENT — Slack peut être muet, la timeline non", async () => {
    // `sendCriticalAlert` rend `false` en silence sans SLACK_WEBHOOK_URL.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new Error('transition invalide'));
    await appeler();
    const evenement = orderEventCreate.mock.calls.find(
      (c) => c[0].data.kind === 'SINALITE_SUBMIT_UNCERTAIN',
    )![0];
    expect(JSON.parse(evenement.data.data)).toMatchObject({ sinaliteOrderId: 71400 });
  });
});

describe('B3 — un refus REÇU prouve que rien n’a été créé', () => {
  it.each([400, 401, 403, 404, 413, 422])('un %i sur /order/new libère au lieu de bloquer', async (code) => {
    // Refus prouvablement AVANT création. Jeton live/sandbox mal apparié :
    // le mode d'échec le plus banal du bouton.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('refus', code, '/order/new'));
    await appeler();
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(1);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it.each([
    [503, 'le fournisseur a peut-être créé la commande avant de tomber'],
    [409, '« existe déjà » : une commande A été créée'],
    [429, 'posable APRÈS traitement de la requête'],
  ])('un %i reste une issue inconnue — %s', async (code) => {
    // ⚠️ 409 et 429 étaient dans ma plage 4xx d'origine. Les relâcher effaçait
    // le marqueur SANS alerte et rendait le bouton cliquable dans la seconde.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('boom', code, '/order/new'));
    await appeler();
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(0);
    expect(sendCriticalAlert).toHaveBeenCalled();
  });

  it("un échec RÉSEAU du jeton libère — il porte désormais son endpoint", async () => {
    // `getToken` s'exécute DANS `request()`, donc avant le fetch de
    // /order/new. Son timeout levait une DOMException anonyme, classée
    // « issue inconnue » avec une alerte affirmant que /order/new était parti.
    // C'est l'échec le plus fréquent : le jeton n'est en cache que par
    // conteneur, donc absent à chaque démarrage à froid.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockRejectedValue(new SinaliteError('token timeout', 0, '/auth/token'));
    await appeler();
    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    expect(effacements).toHaveLength(1);
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });
});

describe("P2002 au rattachement — la trace doit survivre", () => {
  it("garde l'alerte et l'événement même si l'écriture de l'id échoue", async () => {
    // `sinaliteOrderId` est `@unique` : si ce numéro appartient déjà à une
    // autre commande, Prisma lève P2002. Sans filet, l'exception sortait du
    // `catch` → 500 nu, ni événement ni alerte ni audit, précisément dans le
    // cas où la trace compte le plus.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new Error('transition invalide'));
    updateMany.mockImplementation(async (a: { data: Record<string, unknown> }) => {
      if ('sinaliteOrderId' in a.data) throw new Error('Unique constraint failed');
      return { count: 1 };
    });

    await appeler();
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    expect(orderEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'SINALITE_SUBMIT_UNCERTAIN' }) }),
    );
  });

  it("l'alerte part AVANT l'écriture de l'événement", async () => {
    // La cause la plus probable du rollback qui nous amène ici est une base
    // indisponible. Mettre l'écriture DB avant l'alerte plaçait le seul canal
    // indépendant de la DB derrière une écriture DB.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new Error('transition invalide'));
    const ordre: string[] = [];
    sendCriticalAlert.mockImplementation(async () => { ordre.push('alerte'); return true; });
    orderEventCreate.mockImplementation(async () => { ordre.push('evenement'); return {}; });

    await appeler();
    // L'invariant est « l'alerte précède la PREMIÈRE écriture DB », pas une
    // égalité stricte : la route écrit un second événement plus loin.
    expect(ordre[0]).toBe('alerte');
    expect(ordre.indexOf('alerte')).toBeLessThan(ordre.indexOf('evenement'));
  });
});

describe("défense en profondeur : `idFournisseur === null &&` devant preEnvoi", () => {
  it("un échec pré-envoi APRÈS un envoi abouti ne libère NI le verrou NI le marqueur", async () => {
    // ⚠️ MUTANT ÉQUIVALENT AUJOURD'HUI, PAS DEMAIN. Aucun chemin actuel ne
    // produit une `SinaliteError` pré-envoi après un `createOrder` abouti.
    // Mais qu'on ajoute un second appel fournisseur dans le même `try` — une
    // note de production, un `getOrderStatus` — et le jeton, mis en cache par
    // conteneur, peut y expirer : `preEnvoi` deviendrait vrai APRÈS que
    // `/order/new` ait créé la commande. Sans cette garde, on effacerait le
    // marqueur et libérerait le verrou sur une commande bel et bien produite.
    findUnique.mockResolvedValue(commande({ sinalitePayload: JSON.stringify(payloadValide) }));
    createOrder.mockResolvedValue({ orderId: 71400 });
    markOrderSubmitted.mockRejectedValue(new SinaliteError('jeton expiré', 401, '/auth/token'));

    await appeler();

    const effacements = updateMany.mock.calls.filter((c) => c[0].data?.sinaliteSubmitUncertainAt === null);
    const liberations = updateMany.mock.calls.filter((c) => c[0].data?.replayClaimedAt === null);
    const rattachements = updateMany.mock.calls.filter((c) => 'sinaliteOrderId' in (c[0].data ?? {}));

    // On part en branche « soumis mais non enregistré », pas en « rien n'est parti ».
    expect(rattachements).toHaveLength(1);
    expect(liberations).toHaveLength(0);
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    // Le marqueur ne tombe que parce que le rattachement a réussi (count 1).
    expect(effacements).toHaveLength(1);
  });
});
