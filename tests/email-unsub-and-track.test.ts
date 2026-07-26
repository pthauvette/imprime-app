/**
 * send.ts — Audit v2 #7.4 (lien désabo invité) + #7.5 (bouton track fallback).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/emails/queue', () => ({
  queueEmail: vi.fn(async () => ({ sent: true, id: 'e1' })),
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logEmail: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { sendAbandonedCartEmail, sendOrderShippedEmail } from '@/lib/emails/send';
import { queueEmail } from '@/lib/emails/queue';
import { computeOrderEta } from '@/lib/orders/timeline';
import { makeTestUser } from './factories/user';
import { makeTestOrder } from './factories/order';

const ORIG_ENV = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV, AUTH_SECRET: 'fixed-test-secret-min-32-characters-xx', NEXT_PUBLIC_APP_URL: 'https://www.plio.ca' };
});

function lastVars(): Record<string, unknown> {
  return (vi.mocked(queueEmail).mock.calls[0]![0] as { vars: Record<string, unknown> }).vars;
}

describe('#7.4 — abandoned-cart : lien désabo token-based (invité sans compte)', () => {
  it('UNSUBSCRIBE_URL pointe vers /api/newsletter/unsubscribe avec email+token (pas la page auth-gated)', async () => {
    await sendAbandonedCartEmail({
      to: 'Guest@Example.ca',
      firstName: 'Guest',
      productName: 'Cartes',
      resumeUrl: 'https://www.plio.ca/order/review?x=1',
      cartId: 'cart_1',
    });
    const unsub = String(lastVars().UNSUBSCRIBE_URL);
    expect(unsub).toContain('/api/newsletter/unsubscribe?');
    expect(unsub).toContain('email=guest%40example.ca'); // lowercased + url-encodé
    expect(unsub).toContain('token=');
    expect(unsub).not.toContain('/settings/email-preferences'); // plus la page auth-gated
  });
});

describe('#7.5 — order-shipped : bouton track ne pointe plus dans le vide', () => {
  it('sans tracking → TRACK_URL fallback vers la page commande', async () => {
    const order = makeTestOrder({ shippingMethod: 'UPS Standard' });
    await sendOrderShippedEmail({
      order,
      user: makeTestUser({ emailDeliveryNotifications: true }),
      // pas de trackingNumber
    });
    const trackUrl = String(lastVars().TRACK_URL);
    expect(trackUrl).not.toBe(''); // plus de href vide
    expect(trackUrl).toContain(`/orders/${order.id}`);
  });

  it('avec tracking UPS → TRACK_URL = deep link transporteur', async () => {
    const order = makeTestOrder({ shippingMethod: 'UPS Standard' });
    await sendOrderShippedEmail({
      order,
      user: makeTestUser({ emailDeliveryNotifications: true }),
      trackingNumber: '1Z999AA10123456784',
      carrier: 'UPS',
    });
    const trackUrl = String(lastVars().TRACK_URL);
    expect(trackUrl).toContain('ups.com/track');
    expect(trackUrl).toContain('1Z999AA10123456784');
  });
});

describe('finding [41] — ETA du courriel « en route » = même calcul que /orders/[id], plus de +2j calendaires en dur', () => {
  it("ETA_FORMATTED matche exactement computeOrderEta (le même helper que le portail), pas un +2 jours fixe", async () => {
    const order = makeTestOrder({ shippingMethod: 'FedEx Express Saver' });
    await sendOrderShippedEmail({
      order,
      user: makeTestUser({ emailDeliveryNotifications: true }),
    });
    const etaFormatted = String(lastVars().ETA_FORMATTED);
    const expected = computeOrderEta({ createdAt: order.createdAt, status: 'SHIPPED' }, new Date())?.day;
    expect(etaFormatted).toBe(expected);
  });

  it('estimatedDelivery explicite reste overridable (futur appelant avec une ETA calculée précisément)', async () => {
    const order = makeTestOrder({ shippingMethod: 'UPS Standard' });
    const explicit = new Date('2026-03-10T00:00:00.000Z');
    await sendOrderShippedEmail({
      order,
      user: makeTestUser({ emailDeliveryNotifications: true }),
      estimatedDelivery: explicit,
    });
    const etaFormatted = String(lastVars().ETA_FORMATTED);
    expect(etaFormatted).toContain('mars');
  });
});
