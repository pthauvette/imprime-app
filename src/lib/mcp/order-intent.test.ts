import { describe, it, expect, vi, beforeEach } from 'vitest';

const { create, findUnique, update } = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { mcpOrderIntent: { create, findUnique, update } } }));
vi.mock('@/lib/db/orders', () => ({
  isPrismaUniqueError: (e: unknown) =>
    typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002',
}));

import { deriveIdempKey, claimMcpOrderIntent, attachOrderToIntent, completeMcpOrderIntent } from './order-intent';

const P2002 = { code: 'P2002' };

beforeEach(() => { create.mockReset(); findUnique.mockReset(); update.mockReset(); update.mockResolvedValue({}); });

describe('deriveIdempKey — stable, données serveur uniquement', () => {
  const base = { idempotencyKey: 'nonce1', userId: 'u1', items: [{ productId: 2, optionIds: [30, 5] }], shippingMethod: 'UPS Standard', promoCode: null };

  it('déterministe : même entrée → même clé', () => {
    expect(deriveIdempKey(base)).toBe(deriveIdempKey({ ...base }));
  });
  it('ordre des items / optionIds indifférent (normalisé)', () => {
    const swapped = { ...base, items: [{ productId: 2, optionIds: [5, 30] }] };
    expect(deriveIdempKey(swapped)).toBe(deriveIdempKey(base));
    const multiA = { ...base, items: [{ productId: 2, optionIds: [5] }, { productId: 7, optionIds: [9] }] };
    const multiB = { ...base, items: [{ productId: 7, optionIds: [9] }, { productId: 2, optionIds: [5] }] };
    expect(deriveIdempKey(multiA)).toBe(deriveIdempKey(multiB));
  });
  it('change si nonce / items / méthode / promo changent', () => {
    expect(deriveIdempKey({ ...base, idempotencyKey: 'nonce2' })).not.toBe(deriveIdempKey(base));
    expect(deriveIdempKey({ ...base, items: [{ productId: 2, optionIds: [30, 5, 99] }] })).not.toBe(deriveIdempKey(base));
    expect(deriveIdempKey({ ...base, shippingMethod: 'FedEx' })).not.toBe(deriveIdempKey(base));
    expect(deriveIdempKey({ ...base, promoCode: 'BIENVENUE' })).not.toBe(deriveIdempKey(base));
  });
});

describe('claimMcpOrderIntent — claim pessimiste + dedup', () => {
  it('claim libre → new', async () => {
    create.mockResolvedValue({});
    expect(await claimMcpOrderIntent('u1', 'k1')).toEqual({ status: 'new' });
  });
  it('collision + 1er complété → completed (renvoie orderId + url, PAS de 2e commande)', async () => {
    create.mockRejectedValue(P2002);
    findUnique.mockResolvedValue({ success: true, orderId: 'ord_1', checkoutUrl: 'https://stripe/x' });
    expect(await claimMcpOrderIntent('u1', 'k1')).toEqual({ status: 'completed', orderId: 'ord_1', checkoutUrl: 'https://stripe/x' });
  });
  it('collision + 1er en cours/crashé (success=false) → pending (avec orderId si déjà écrit)', async () => {
    create.mockRejectedValue(P2002);
    findUnique.mockResolvedValue({ success: false, orderId: 'ord_pending', checkoutUrl: null });
    expect(await claimMcpOrderIntent('u1', 'k1')).toEqual({ status: 'pending', orderId: 'ord_pending' });
  });
  it('collision + success=true mais orderId null (cas dégradé) → pending', async () => {
    create.mockRejectedValue(P2002);
    findUnique.mockResolvedValue({ success: true, orderId: null, checkoutUrl: null });
    expect(await claimMcpOrderIntent('u1', 'k1')).toEqual({ status: 'pending', orderId: null });
  });
  it('erreur DB non-P2002 → propagée (pas avalée)', async () => {
    create.mockRejectedValue(new Error('connection lost'));
    await expect(claimMcpOrderIntent('u1', 'k1')).rejects.toThrow('connection lost');
  });
});

describe('attach / complete', () => {
  it('attachOrderToIntent écrit orderId sur la row du claim', async () => {
    await attachOrderToIntent('u1', 'k1', 'ord_9');
    expect(update.mock.calls[0]![0]).toEqual({ where: { userId_idempKey: { userId: 'u1', idempKey: 'k1' } }, data: { orderId: 'ord_9' } });
  });
  it('completeMcpOrderIntent flippe success + stocke orderId/url', async () => {
    await completeMcpOrderIntent('u1', 'k1', 'ord_9', 'https://stripe/pay');
    expect(update.mock.calls[0]![0].data).toEqual({ success: true, orderId: 'ord_9', checkoutUrl: 'https://stripe/pay' });
  });
});
