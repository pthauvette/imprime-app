/**
 * Rattachement d'un numéro fournisseur trouvé au portail.
 *
 * POURQUOI CETTE ROUTE, ET DONC CE FICHIER. L'encadré « soumission partie sans
 * réponse » demande à un humain d'aller vérifier au portail. Cette vérification
 * a deux issues et une seule avait un geste : « rien au portail ». L'admin qui
 * TROUVAIT la commande n'avait que de mauvais choix — attester par écrit qu'il
 * n'avait rien vu, ou ne rien faire, en laissant une commande en production
 * sans identifiant fournisseur, donc invisible aux webhooks de statut.
 *
 * Ce que ce fichier verrouille : la route ne peut pas devenir un champ libre.
 * Écrire un numéro sur une commande la fait passer SUBMITTED — c'est-à-dire
 * « la production est lancée, ne relance pas ». Se tromper de commande ou de
 * numéro se paie des deux côtés.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted` : les fabriques `vi.mock` sont remontées au-dessus des `const`
// du fichier, qui n'existent donc pas encore quand elles s'exécutent.
const { findUnique, updateMany, orderEventCreate, markOrderSubmitted, recordAdminAudit } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  orderEventCreate: vi.fn(),
  markOrderSubmitted: vi.fn(),
  recordAdminAudit: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: {
  order: { findUnique, updateMany },
  orderEvent: { create: orderEventCreate },
} }));
vi.mock('@/lib/db/orders', () => ({ markOrderSubmitted }));
vi.mock('@/lib/db/admin-audit', () => ({ recordAdminAudit }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// ⚠️ FORME EXACTE de `requireAdmin` : `{ ok, user, userId }`. Un mock qui rend
// `{ ok, session }` fait lever la route sur `guard.user.email` AVANT le
// comportement annoncé par chaque titre — la preuve devient décorative.
vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({ ok: true, user: { id: 'admin1', email: 'a@plio.ca' }, userId: 'admin1' }),
}));

import { POST } from '@/app/api/admin/orders/[id]/attach-sinalite-id/route';
import { PEREMPTION_VERROU_MS } from '@/lib/orders/replay-lock';

const ctx = { params: Promise.resolve({ id: 'ord_1' }) };
const req = (body: unknown) =>
  new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });

/** Commande dans l'état exact où ce geste a un sens. */
function incertaine(over: Record<string, unknown> = {}) {
  return {
    id: 'ord_1',
    status: 'FAILED',
    paidAt: new Date('2026-08-01'),
    sinaliteOrderId: null,
    sinaliteSubmitUncertainAt: new Date('2026-08-01T10:00:00Z'),
    replayClaimedAt: null,
    ...over,
  };
}

/** Écritures qui LÈVENT le marqueur (par opposition à la prise de verrou). */
const levees = () =>
  updateMany.mock.calls
    .map((c) => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
    .filter((a) => 'sinaliteSubmitUncertainAt' in (a.data ?? {}));

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(incertaine());
  updateMany.mockResolvedValue({ count: 1 });
  markOrderSubmitted.mockResolvedValue(undefined);
});

describe('la route refuse tout ce qui n’est pas la résolution d’une incertitude', () => {
  it('aucun marqueur → 400, et RIEN n’est écrit', async () => {
    // Sans ce garde, la route devient un moyen d'écrire n'importe quel numéro
    // sur n'importe quelle commande — donc de faire passer une commande jamais
    // soumise pour une commande en production.
    findUnique.mockResolvedValue(incertaine({ sinaliteSubmitUncertainAt: null }));
    const res = await POST(req({ sinaliteOrderId: 123 }), ctx);
    expect(res.status).toBe(400);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('identifiant fournisseur déjà présent → 400', async () => {
    findUnique.mockResolvedValue(incertaine({ sinaliteOrderId: '777' }));
    const res = await POST(req({ sinaliteOrderId: 123 }), ctx);
    expect(res.status).toBe(400);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('jamais encaissée → 400', async () => {
    findUnique.mockResolvedValue(incertaine({ paidAt: null }));
    const res = await POST(req({ sinaliteOrderId: 123 }), ctx);
    expect(res.status).toBe(400);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('commande introuvable → 404', async () => {
    findUnique.mockResolvedValue(null);
    const res = await POST(req({ sinaliteOrderId: 123 }), ctx);
    expect(res.status).toBe(404);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('⚠️ verrou VIVANT → 409 : ce que l’admin lit au portail est un instantané périmé', async () => {
    // Un envoi peut être en vol. Le numéro lu peut appartenir à une soumission
    // dont notre processus va recevoir la réponse dans la seconde, et qui
    // écrira le même identifiant.
    findUnique.mockResolvedValue(incertaine({ replayClaimedAt: new Date(Date.now() - 30_000) }));
    const res = await POST(req({ sinaliteOrderId: 123 }), ctx);
    expect(res.status).toBe(409);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('verrou PÉRIMÉ → accepté (sinon une tentative interrompue bloquerait à vie)', async () => {
    findUnique.mockResolvedValue(
      incertaine({ replayClaimedAt: new Date(Date.now() - PEREMPTION_VERROU_MS - 1000) }),
    );
    const res = await POST(req({ sinaliteOrderId: 123 }), ctx);
    expect(res.status).toBe(200);
    expect(markOrderSubmitted).toHaveBeenCalledTimes(1);
  });
});

describe('validation du numéro — la colonne sert de clé de rapprochement', () => {
  it.each([
    ['zéro', 0],
    ['négatif', -5],
    ['décimal', 12.5],
    ['texte', 'abc'],
    ['vide', ''],
    ['absent', undefined],
    ['objet', { a: 1 }],
  ])('%s → 400, rien écrit', async (_label, valeur) => {
    const res = await POST(req({ sinaliteOrderId: valeur }), ctx);
    expect(res.status).toBe(400);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('chaîne numérique acceptée et convertie (le formulaire envoie du texte)', async () => {
    const res = await POST(req({ sinaliteOrderId: '4417' }), ctx);
    expect(res.status).toBe(200);
    expect(markOrderSubmitted).toHaveBeenCalledWith({ orderId: 'ord_1', sinaliteOrderId: 4417 });
  });
});

describe('numéro déjà pris par une AUTRE commande', () => {
  it('P2002 → 409 avec un message qui nomme la cause, pas un 500 nu', async () => {
    // Erreur humaine la plus probable : un chiffre lu de travers au portail.
    // Le rattacher corromprait DEUX fiches.
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    markOrderSubmitted.mockRejectedValueOnce(p2002);

    const res = await POST(req({ sinaliteOrderId: 4417 }), ctx);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: expect.stringContaining('DÉJÀ rattaché à une autre commande'),
    });
    // Le marqueur DOIT survivre : l'incertitude n'est pas levée. (Le verrou,
    // lui, est pris puis RENDU — d'où l'assertion sur la LEVÉE plutôt que sur
    // « aucune écriture ».)
    expect(levees()).toHaveLength(0);
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });

  it('toute autre levée → 500, marqueur conservé', async () => {
    markOrderSubmitted.mockRejectedValueOnce(new Error('DB down'));
    const res = await POST(req({ sinaliteOrderId: 4417 }), ctx);
    expect(res.status).toBe(500);
    expect(levees()).toHaveLength(0);
  });
});

describe('chemin nominal', () => {
  it('lève le marqueur SEULEMENT après l’écriture, et de façon PORTÉE', async () => {
    const ordre: string[] = [];
    markOrderSubmitted.mockImplementation(async () => { ordre.push('markOrderSubmitted'); });
    updateMany.mockImplementation(async (a: { data?: Record<string, unknown> }) => {
      ordre.push('sinaliteSubmitUncertainAt' in (a?.data ?? {}) ? 'leveMarqueur' : 'priseVerrou');
      return { count: 1 };
    });

    const res = await POST(req({ sinaliteOrderId: 4417 }), ctx);

    expect(res.status).toBe(200);
    // Si l'écriture échoue, RIEN ne doit être levé — d'où cet ordre.
    expect(ordre).toEqual(['priseVerrou', 'markOrderSubmitted', 'leveMarqueur']);
  });

  it('la clause `where` de la levée porte le marqueur LU', async () => {
    await POST(req({ sinaliteOrderId: 4417 }), ctx);
    const arg = levees()[0]!;
    // Sans cette condition, on écraserait l'état d'un autre acteur qui aurait
    // repris la main entre notre lecture et cette écriture.
    expect(arg.where.sinaliteSubmitUncertainAt).toEqual(new Date('2026-08-01T10:00:00Z'));
    // Portée AUSSI par le verrou qu'on a pris : c'est lui qui prouve que
    // personne n'est passé entre-temps.
    expect(arg.where.replayClaimedAt).toBeInstanceOf(Date);
    expect(arg.data).toEqual({ sinaliteSubmitUncertainAt: null, replayClaimedAt: null });
  });

  it('trace un audit DISTINCT de « rien au portail »', async () => {
    // « je n'ai rien vu » et « je l'ai vue, la voici » sont deux affirmations
    // différentes, et c'est ce qu'un audit doit pouvoir distinguer.
    await POST(req({ sinaliteOrderId: 4417 }), ctx);
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'ADMIN_ATTACH_SINALITE_ID',
        adminEmail: 'a@plio.ca',
        targetId: 'ord_1',
        data: expect.objectContaining({ sinaliteOrderId: 4417 }),
      }),
    );
  });
});

describe('F3 — le contrôle de verrou doit être refermé par une écriture atomique', () => {
  it('le verrou est PRIS conditionné sur ce qui a été lu, avant markOrderSubmitted', async () => {
    const ordre: string[] = [];
    updateMany.mockImplementation(async (a: { data?: Record<string, unknown> }) => {
      ordre.push(a?.data?.replayClaimedAt instanceof Date ? 'prise' : 'levee');
      return { count: 1 };
    });
    markOrderSubmitted.mockImplementation(async () => { ordre.push('markOrderSubmitted'); });

    await POST(req({ sinaliteOrderId: 4417 }), ctx);

    expect(ordre).toEqual(['prise', 'markOrderSubmitted', 'levee']);
    const prise = updateMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    // Conditionnée sur EXACTEMENT l'état lu : sinon le test de verrou plus
    // haut reste un read-then-act, et une soumission peut reprendre la main
    // entre la lecture et l'écriture.
    expect(prise.where).toMatchObject({
      sinaliteOrderId: null,
      sinaliteSubmitUncertainAt: new Date('2026-08-01T10:00:00Z'),
      replayClaimedAt: null,
    });
  });

  it('verrou repris entre la lecture et la prise → 409, RIEN n’est écrit', async () => {
    updateMany.mockResolvedValueOnce({ count: 0 });
    const res = await POST(req({ sinaliteOrderId: 4417 }), ctx);
    expect(res.status).toBe(409);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });

  it('échec d’écriture → le verrou pris est RENDU (pas 5 min de blocage sur un chiffre mal lu)', async () => {
    markOrderSubmitted.mockRejectedValueOnce(new Error('DB down'));
    await POST(req({ sinaliteOrderId: 4417 }), ctx);
    const rendu = updateMany.mock.calls.at(-1)![0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(rendu.data).toEqual({ replayClaimedAt: null });
    expect(rendu.where.replayClaimedAt).toBeInstanceOf(Date);
  });
});

describe('F6 — statut incompatible', () => {
  it('CANCELLED → 400 explicite, pas un 500 nu', async () => {
    findUnique.mockResolvedValue(incertaine({ status: 'CANCELLED' }));
    const res = await POST(req({ sinaliteOrderId: 4417 }), ctx);
    expect(res.status).toBe(400);
    expect(markOrderSubmitted).not.toHaveBeenCalled();
  });
});
