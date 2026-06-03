/**
 * Tests pour Round 24 #5 : la trackUrl générée dans les emails ne doit
 * PAS contenir l'email du customer en query string.
 *
 * Avant Round 24 #5 : /track?orderId=X&email=Y → leak PII dans access
 * logs serveur + referrer headers vers domaines externes si l'email
 * client suit le lien.
 *
 * Après Round 24 #5 : /track?orderId=X (email retiré, à taper dans le
 * form). orderId n'est pas PII — il est déjà visible dans le sujet et
 * le corps du courriel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/emails/render', () => ({
  MARKETING_TEMPLATES: new Set(['reengagement-follow-up', 'reengagement-winback', 'reseller-monthly-stats']),
  sendEmail: vi.fn(async () => ({ sent: true })),
  EMAIL_SUBJECTS: {},
}));

// On force le fallback path de queueEmail (qui call directement sendEmail
// avec les vars originales) en faisant throw `create`. Sinon les vars
// transitent par DB → JSON.stringify → re-parse, plus chiant à intercepter.
vi.mock('@/lib/db', () => ({
  prisma: {
    emailDelivery: {
      create: vi.fn(async () => { throw new Error('test: force fallback path'); }),
    },
    order: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return { log: stub, logEmail: stub };
});

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => undefined),
}));

import { sendOrderConfirmationEmail } from '@/lib/emails/send';
import * as render from '@/lib/emails/render';
import { makeTestUser } from './factories/user';
import { makeTestOrder } from './factories/order';

beforeEach(() => {
  vi.mocked(render.sendEmail).mockClear();
});

describe('Round 24 #5 — privacy : trackUrl ne doit PAS contenir email', () => {
  it('TRACK_ORDER_URL ne contient PAS l\'email du customer', async () => {
    const user = makeTestUser({ id: 'user_1', email: 'victim-leak@example.com' });
    const order = makeTestOrder({
      id: 'order_1',
      userId: 'user_1',
      sinaliteOrderId: 'SIN-12345',
      status: 'PAID',
    });

    await sendOrderConfirmationEmail({ order, user });

    expect(render.sendEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(render.sendEmail).mock.calls[0]![0] as { vars: Record<string, string> };
    const trackUrl = args.vars.TRACK_ORDER_URL;

    expect(trackUrl).toBeDefined();
    // Critique : aucune trace de l'email (anti-leak privacy)
    expect(trackUrl).not.toContain('victim-leak');
    expect(trackUrl).not.toContain('example.com');
    expect(trackUrl).not.toContain('email=');
    expect(trackUrl).not.toContain('email%3D');
    // OK : orderId reste utile pour pré-remplir
    expect(trackUrl).toContain('orderId=SIN-12345');
  });

  it('TRACK_ORDER_URL fallback orderId à l\'id suffix si pas de sinaliteOrderId', async () => {
    const user = makeTestUser({ id: 'user_1', email: 'a@b.ca' });
    const order = makeTestOrder({
      id: 'cmabcdef0123456789xyz12345',
      userId: 'user_1',
      sinaliteOrderId: null,
      status: 'PAID',
    });

    await sendOrderConfirmationEmail({ order, user });

    const args = vi.mocked(render.sendEmail).mock.calls[0]![0] as { vars: Record<string, string> };
    const trackUrl = args.vars.TRACK_ORDER_URL;

    expect(trackUrl).not.toContain('a@b.ca');
    expect(trackUrl).not.toContain('email=');
    // Suffix = 6 derniers chars uppercase de l'id ('cmabcdef0123456789xyz12345' → 'Z12345')
    expect(trackUrl).toContain('orderId=Z12345');
    expect(trackUrl).toMatch(/orderId=[A-Z0-9]{6}$/);
  });

  it('TRACK_ORDER_URL pointe vers /track sur le APP_URL', async () => {
    const user = makeTestUser({ id: 'user_1', email: 'a@b.ca' });
    const order = makeTestOrder({
      id: 'order_1',
      userId: 'user_1',
      sinaliteOrderId: 'SIN-1',
      status: 'PAID',
    });

    await sendOrderConfirmationEmail({ order, user });

    const args = vi.mocked(render.sendEmail).mock.calls[0]![0] as { vars: Record<string, string> };
    expect(args.vars.TRACK_ORDER_URL).toMatch(/^https?:\/\/[^/]+\/track\?/);
  });
});
