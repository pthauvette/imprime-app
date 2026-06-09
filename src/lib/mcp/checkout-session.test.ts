import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { sessionsCreate } = vi.hoisted(() => ({ sessionsCreate: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ checkout: { sessions: { create: sessionsCreate } } }) }));

import { createMcpCheckoutSession, isHeadlessOrderEnabled } from './checkout-session';

beforeEach(() => {
  sessionsCreate.mockReset();
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.plio.ca');
});
afterEach(() => vi.unstubAllEnvs());

const input = {
  orderId: 'ord_abcdef123',
  amountCents: 4256,
  currency: 'cad',
  customerEmail: 'owner@plio.ca',
  productSummary: 'Carte de visite',
  idempKey: 'stablehash',
  nowMs: 1_780_000_000_000,
};

describe('createMcpCheckoutSession', () => {
  it('crée la Session avec metadata.orderId (PI + session), customer_email compte, idempotencyKey, expiration', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    const r = await createMcpCheckoutSession(input);
    expect(r).toEqual({ sessionId: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });

    const [params, opts] = sessionsCreate.mock.calls[0]!;
    expect(params.metadata).toEqual({ kind: 'mcp-order', orderId: 'ord_abcdef123' });
    // CRUCIAL : le webhook finalise via payment_intent_data.metadata.orderId.
    expect(params.payment_intent_data.metadata.orderId).toBe('ord_abcdef123');
    expect(params.customer_email).toBe('owner@plio.ca'); // email COMPTE, pas agent
    expect(params.line_items[0].price_data.unit_amount).toBe(4256);
    expect(params.line_items[0].price_data.currency).toBe('cad');
    // idempotencyKey Stripe dérivé du hash stable → un rejeu ne crée pas 2 Sessions.
    expect(opts.idempotencyKey).toBe('mcp_cs_stablehash');
    // expiration courte (60 min) anti-arbitrage de prix.
    expect(params.expires_at).toBe(Math.floor(input.nowMs / 1000) + 3600);
    expect(params.success_url).toContain('/orders/ord_abcdef123');
  });

  it('Stripe sans URL → throw (jamais retourner une session inutilisable)', async () => {
    sessionsCreate.mockResolvedValue({ id: 'cs_2', url: null });
    await expect(createMcpCheckoutSession(input)).rejects.toThrow(/sans URL/);
  });
});

describe('isHeadlessOrderEnabled — flag OFF par défaut', () => {
  it('absent → false', () => {
    vi.stubEnv('MCP_CREATE_ORDER_PAY', '');
    expect(isHeadlessOrderEnabled()).toBe(false);
  });
  it('=1 → true', () => {
    vi.stubEnv('MCP_CREATE_ORDER_PAY', '1');
    expect(isHeadlessOrderEnabled()).toBe(true);
  });
  it('autre valeur → false', () => {
    vi.stubEnv('MCP_CREATE_ORDER_PAY', 'true');
    expect(isHeadlessOrderEnabled()).toBe(false);
  });
});
