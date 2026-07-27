/**
 * order-delivered — finding [42] : le courriel de livraison ne mentionnait
 * aucun recours qualité (10j défaut presse / 24h dommage visible), uniquement
 * de la vente (avis, photo Instagram, réachat). Verrouille le nouveau bloc
 * recours + le sujet mailto pré-rempli.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/emails/queue', () => ({
  queueEmail: vi.fn(async () => ({ sent: true, id: 'e1' })),
}));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logEmail: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { sendOrderDeliveredEmail } from '@/lib/emails/send';
import { queueEmail } from '@/lib/emails/queue';
import { renderEmail } from '@/lib/emails/render';
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

describe('finding [42] — order-delivered : bloc recours qualité', () => {
  it('REPORT_PROBLEM_SUBJECT encode le sujet mailto avec le displayId', async () => {
    const order = makeTestOrder({ sinaliteOrderId: '48312' });
    await sendOrderDeliveredEmail({ order, user: makeTestUser({ emailDeliveryNotifications: true }) });
    const subject = String(lastVars().REPORT_PROBLEM_SUBJECT);
    expect(decodeURIComponent(subject)).toBe('Problème avec ma commande #48312');
  });

  it('le HTML rendu mentionne le délai 10 jours ouvrables et 24h', async () => {
    const order = makeTestOrder({ sinaliteOrderId: '48312' });
    await sendOrderDeliveredEmail({ order, user: makeTestUser({ emailDeliveryNotifications: true }) });
    const html = renderEmail('order-delivered', lastVars() as Record<string, string | number>);
    expect(html).toContain('10 jours ouvrables');
    expect(html).toMatch(/24.?h/);
    expect(html).toContain('mailto:bonjour@plio.ca?subject=');
  });
});
