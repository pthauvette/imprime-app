/**
 * Levée MANUELLE de l'état « /order/new émis, issue inconnue ».
 *
 * POURQUOI CETTE ROUTE. Le verrou d'exécution `replayClaimedAt` EXPIRE au bout
 * de quelques minutes — il rendait donc à l'admin le droit de recliquer, c'est
 * à dire de produire une seconde fois, sans qu'aucun signal ne dise qu'une
 * commande existe peut-être déjà chez le fournisseur.
 *
 * Une incertitude sur un appel money ne se résout pas par une minuterie. Elle
 * se résout par un humain qui a regardé le portail, et dont on trace le nom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const update = vi.fn();
const updateMany = vi.fn();
const orderEventCreate = vi.fn();
const recordAdminAudit = vi.fn();

vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique, update, updateMany }, orderEvent: { create: orderEventCreate } } }));
// Forme EXACTE de requireAdmin : `{ ok, user, userId }`. Un mock qui rend
// `{ ok, session }` fait exploser la route avant l'assertion et rend le test
// décoratif — c'est arrivé sur la suite voisine.
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({ ok: true, user: { id: 'admin1', email: 'a@plio.ca' }, userId: 'admin1' }),
}));
vi.mock('@/lib/db/admin-audit', () => ({ recordAdminAudit }));

const { POST } = await import('@/app/api/admin/orders/[id]/clear-submit-uncertainty/route');
const appeler = () => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'o1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
  updateMany.mockResolvedValue({ count: 1 });
  orderEventCreate.mockResolvedValue({});
});

describe('levée du blocage', () => {
  it('efface le marqueur ET le verrou résiduel', async () => {
    findUnique.mockResolvedValue({
      id: 'o1', status: 'FAILED', sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date('2026-08-12T10:00:00Z'),
      replayClaimedAt: null,
    });
    const res = await appeler();
    expect(res.status).toBe(200);
    // Garder le verrou n'aurait plus de sens, et l'oublier laisserait un
    // blocage résiduel jusqu'à péremption.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { sinaliteSubmitUncertainAt: null, replayClaimedAt: null } }),
    );
  });

  it("trace QUI a levé le doute — c'est tout l'objet du geste", async () => {
    findUnique.mockResolvedValue({
      id: 'o1', status: 'FAILED', sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date('2026-08-12T10:00:00Z'),
      replayClaimedAt: null,
    });
    await appeler();
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ADMIN_CLEAR_SUBMIT_UNCERTAINTY', adminEmail: 'a@plio.ca' }),
    );
    expect(orderEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: 'SINALITE_SUBMIT_UNCERTAIN_CLEARED' }),
      }),
    );
  });
});

describe('refus', () => {
  it("une commande sans incertitude n'est pas « levable »", async () => {
    findUnique.mockResolvedValue({ id: 'o1', status: 'PAID', sinaliteOrderId: null, sinaliteSubmitUncertainAt: null, replayClaimedAt: null });
    const res = await appeler();
    expect(res.status).toBe(400);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('commande introuvable → 404, rien écrit', async () => {
    findUnique.mockResolvedValue(null);
    const res = await appeler();
    expect(res.status).toBe(404);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('LE cas qui manquait : levée pendant un rejeu EN VOL', () => {
  it("refuse tant que le verrou est vivant — sinon deux /order/new partent", async () => {
    // Scénario reproduit par la revue, avec UN SEUL admin et UN SEUL onglet :
    // l'envoi peut rester en vol ~25 s (jeton 10 s + /order/new 15 s). Dès que
    // le marqueur est posé, l'interface propose « J'ai vérifié ». L'admin
    // regarde le portail, n'y voit rien — la commande n'y est pas ENCORE —
    // clique de bonne foi, et détruit le verrou de la requête en cours.
    findUnique.mockResolvedValue({
      id: 'o1', status: 'FAILED', sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date(),
      replayClaimedAt: new Date(), // verrou tout frais = envoi en vol
    });
    const res = await appeler();
    expect(res.status).toBe(409);
    // RIEN n'est écrit : ni marqueur effacé, ni verrou détruit.
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect((await res.json()).error).toMatch(/ENCORE EN COURS/i);
  });

  it('accepte une fois le verrou PÉRIMÉ', async () => {
    const vieux = new Date(Date.now() - 6 * 60_000);
    findUnique.mockResolvedValue({
      id: 'o1', status: 'FAILED', sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: vieux,
      replayClaimedAt: vieux,
    });
    updateMany.mockResolvedValue({ count: 1 });
    const res = await appeler();
    expect(res.status).toBe(200);
  });

  it("l'effacement est CONDITIONNÉ sur l'état lu — pas de levée en double", async () => {
    const vieux = new Date(Date.now() - 6 * 60_000);
    findUnique.mockResolvedValue({
      id: 'o1', status: 'FAILED', sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: vieux, replayClaimedAt: vieux,
    });
    // Une autre levée a gagné la course : count = 0.
    updateMany.mockResolvedValue({ count: 0 });
    const res = await appeler();
    expect(res.status).toBe(409);
    // Ni audit ni événement : le geste doit être exactement-une-fois.
    expect(recordAdminAudit).not.toHaveBeenCalled();
    expect(orderEventCreate).not.toHaveBeenCalled();
  });
});

describe("les clauses `where` de la levée — ce que le gate ne voyait pas", () => {
  /**
   * Le seul test de la levée n'assertait que `data`. Réduire l'`updateMany` à
   * `prisma.order.update({ where: { id } })` — la « simplification » que le
   * commentaire du fichier annonce lui-même comme la faute à éviter — passait
   * le gate à 42/42, en rouvrant la destruction du verrou d'un envoi en vol.
   */
  const etat = {
    id: 'o1',
    status: 'FAILED',
    sinaliteOrderId: null,
    sinaliteSubmitUncertainAt: new Date('2026-08-12T10:00:00Z'),
    replayClaimedAt: new Date('2026-08-12T09:50:00Z'), // périmé
  };

  it("l'effacement est porté par le marqueur ET le verrou tels que LUS", async () => {
    findUnique.mockResolvedValue(etat);
    updateMany.mockResolvedValue({ count: 1 });
    await appeler();
    const where = updateMany.mock.calls[0]![0].where;
    // Sans ces deux clauses, une requête lente pourrait effacer le marqueur et
    // le verrou tout neufs d'un rejeu qui vient de reprendre la main.
    expect(where.sinaliteSubmitUncertainAt).toBe(etat.sinaliteSubmitUncertainAt);
    expect(where.replayClaimedAt).toBe(etat.replayClaimedAt);
    expect(where.id).toBe('o1');
  });

  it("n'écrit RIEN d'autre que les deux remises à null", async () => {
    findUnique.mockResolvedValue(etat);
    updateMany.mockResolvedValue({ count: 1 });
    await appeler();
    expect(updateMany.mock.calls[0]![0].data).toEqual({
      sinaliteSubmitUncertainAt: null,
      replayClaimedAt: null,
    });
  });
});

describe('la levée suit le seuil PARTAGÉ', () => {
  it('refuse juste EN DEÇÀ de la péremption, accepte juste au-delà', async () => {
    // Deux valeurs divergentes entre la route de rejeu et celle-ci rouvriraient
    // exactement le trou que ce garde ferme. Les deux bords sont testés contre
    // la constante elle-même, pas contre un 5 en dur.
    const { PEREMPTION_VERROU_MS } = await import('@/lib/orders/replay-lock');
    const base = {
      id: 'o1', status: 'FAILED', sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date('2026-08-12T10:00:00Z'),
    };

    findUnique.mockResolvedValue({ ...base, replayClaimedAt: new Date(Date.now() - (PEREMPTION_VERROU_MS - 5_000)) });
    expect((await appeler()).status).toBe(409);

    vi.clearAllMocks();
    updateMany.mockResolvedValue({ count: 1 });
    orderEventCreate.mockResolvedValue({});
    findUnique.mockResolvedValue({ ...base, replayClaimedAt: new Date(Date.now() - (PEREMPTION_VERROU_MS + 5_000)) });
    expect((await appeler()).status).toBe(200);
  });
});
