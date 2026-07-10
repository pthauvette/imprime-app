import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocke la couche DB (lecture) — on teste la logique d'AUTORISATION + le format,
// pas Prisma. getOrderById charge par id seul → l'invariant « order.userId ===
// userId » vit dans orders.ts, c'est LUI qu'on verrouille.
const { getOrderById, listOrdersForUser } = vi.hoisted(() => ({
  getOrderById: vi.fn(),
  listOrdersForUser: vi.fn(),
}));
vi.mock('@/lib/db/orders', () => ({ getOrderById, listOrdersForUser }));

import {
  listUserOrders,
  formatOrdersListText,
  getUserOrderStatus,
  formatOrderStatusText,
  buildUserReorderLink,
  formatReorderText,
} from './orders';

beforeEach(() => {
  getOrderById.mockReset();
  listOrdersForUser.mockReset();
});

/** Order minimal viable pour getOrderById (avec events + champs d'affichage). */
function fakeOrder(over: Record<string, unknown> = {}) {
  return {
    id: 'o_1',
    userId: 'u_1',
    status: 'SHIPPED',
    amountCents: 12999,
    createdAt: new Date('2026-07-01T12:00:00Z'),
    productSummary: 'Cartes 14pt + UV (500)',
    itemsSnapshot: null,
    itemsCount: 1,
    shipCity: 'Montréal',
    shipProvince: 'QC',
    sinalitePayload: JSON.stringify({ items: [{ productId: 7, options: { Stock: '5', size: '4' } }] }),
    events: [
      { kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ status: 'SHIPPED', trackingNumber: '1Z999', carrier: 'UPS' }), createdAt: new Date('2026-07-03T12:00:00Z') },
    ],
    ...over,
  };
}

describe('MCP list_orders', () => {
  it('mappe les commandes du user (résumé + total)', async () => {
    listOrdersForUser.mockResolvedValue([
      { id: 'o_1', createdAt: new Date('2026-07-01T00:00:00Z'), status: 'DELIVERED', amountCents: 5000, productSummary: 'Flyers (250)', itemsCount: 1 },
    ]);
    const out = await listUserOrders('u_1', 10);
    expect(listOrdersForUser).toHaveBeenCalledWith({ userId: 'u_1', limit: 10 });
    expect(out[0]).toMatchObject({ id: 'o_1', status: 'DELIVERED', summary: 'Flyers (250)', totalCents: 5000 });
  });

  it('userId vide → [] SANS interroger la DB (défense en profondeur cross-user)', async () => {
    const out = await listUserOrders('', 10);
    expect(out).toEqual([]);
    expect(listOrdersForUser).not.toHaveBeenCalled();
  });

  it('fallback résumé quand productSummary est vide', async () => {
    listOrdersForUser.mockResolvedValue([
      { id: 'o_2', createdAt: new Date(), status: 'PAID', amountCents: 100, productSummary: '  ', itemsCount: 3 },
    ]);
    const out = await listUserOrders('u_1');
    expect(out[0].summary).toBe('3 articles');
  });

  it('formatOrdersListText : vide → message clair, sinon liste + aide', () => {
    expect(formatOrdersListText([])).toContain('Aucune commande');
    const text = formatOrdersListText([
      { id: 'o_1', placedAtIso: '2026-07-01T00:00:00Z', status: 'SHIPPED', statusLabel: 'Expédiée', summary: 'Cartes (500)', totalCents: 12999 },
    ]);
    expect(text).toContain('#o_1');
    expect(text).toContain('129,99'); // le « $ » est précédé d'une espace insécable étroite (Intl fr-CA)
    expect(text).not.toContain('undefined');
  });
});

describe('MCP get_order_status — AUTORISATION', () => {
  it('refuse une commande qui n\'appartient PAS au user (introuvable, pas de fuite)', async () => {
    getOrderById.mockResolvedValue(fakeOrder({ userId: 'someone_else' }));
    const r = await getUserOrderStatus('u_1', 'o_1');
    expect(r).toEqual({ ok: false, notFound: true });
  });

  it('commande inexistante → introuvable', async () => {
    getOrderById.mockResolvedValue(null);
    const r = await getUserOrderStatus('u_1', 'o_x');
    expect(r).toEqual({ ok: false, notFound: true });
  });

  it('commande du user → vue statut avec suivi + ETA', async () => {
    getOrderById.mockResolvedValue(fakeOrder());
    const r = await getUserOrderStatus('u_1', 'o_1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.tracking).toEqual({ number: '1Z999', carrier: 'UPS', url: expect.stringContaining('ups.com') });
    expect(r.view.shipTo).toBe('Montréal, QC');
    expect(r.view.items).toEqual(['Cartes 14pt + UV (500)']);
  });

  it('formatOrderStatusText inclut suivi + lien, sans undefined', () => {
    const text = formatOrderStatusText({
      id: 'o_1', status: 'SHIPPED', statusLabel: 'Expédiée', placedAtIso: '2026-07-01T00:00:00Z',
      items: ['Cartes 14pt + UV (500)'], totalCents: 12999, shipTo: 'Montréal, QC',
      tracking: { number: '1Z999', carrier: 'UPS', url: 'https://www.ups.com/track?tracknum=1Z999' },
      eta: { day: 'lundi 6 juil.', relative: 'dans 2 jours' },
    });
    expect(text).toContain('1Z999');
    expect(text).toContain('ups.com');
    expect(text).toContain('Livraison estimée');
    expect(text).not.toContain('undefined');
  });
});

describe('MCP reorder — AUTORISATION + lien', () => {
  it('refuse une commande d\'un autre user', async () => {
    getOrderById.mockResolvedValue(fakeOrder({ userId: 'other' }));
    const r = await buildUserReorderLink('u_1', 'o_1');
    expect(r).toEqual({ ok: false, notFound: true });
  });

  it('commande du user → URL absolue de configurateur pré-rempli', async () => {
    getOrderById.mockResolvedValue(fakeOrder());
    const r = await buildUserReorderLink('u_1', 'o_1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toMatch(/^https?:\/\//);
    expect(r.url).toContain('/order/');
  });

  it('payload illisible → échec explicite (pas une URL bidon)', async () => {
    getOrderById.mockResolvedValue(fakeOrder({ sinalitePayload: 'pas du json' }));
    const r = await buildUserReorderLink('u_1', 'o_1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.notFound).toBe(false);
  });

  it('formatReorderText : ok → lien, introuvable → message compte', () => {
    expect(formatReorderText('o_1', { ok: true, url: 'https://www.plio.ca/order/configure?productId=7&options=5' }))
      .toContain('plio.ca/order/configure');
    expect(formatReorderText('o_9', { ok: false, notFound: true })).toContain('introuvable');
  });
});
