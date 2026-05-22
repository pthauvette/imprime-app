/**
 * Tests pour le template payment-failed + le handler webhook qui le déclenche.
 *
 * Couvre :
 *   - renderEmail('payment-failed', vars) rend bien le HTML + substitue les vars
 *   - EMAIL_SUBJECTS['payment-failed'] inclut l'ORDER_ID
 *   - sendPaymentFailedEmail queue avec label correct + default retryUrl
 *   - handlePaymentFailed du stripe-process appelle markOrderFailed PUIS
 *     sendPaymentFailedEmail (best-effort, ne throw pas si email fail)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderEmail, EMAIL_SUBJECTS } from '@/lib/emails/render';

describe('renderEmail("payment-failed")', () => {
  it('substitue les vars + génère du HTML valide', () => {
    const html = renderEmail('payment-failed', {
      CUSTOMER_FIRST_NAME: 'Sophie',
      ORDER_ID: 'SIN-48312',
      FAILURE_REASON: 'Votre carte a été refusée par votre banque.',
      RETRY_URL: 'https://plio.ca/order/start',
    });
    expect(html).toContain('Sophie');
    expect(html).toContain('SIN-48312');
    expect(html).toContain('Votre carte a été refusée');
    expect(html).toContain('https://plio.ca/order/start');
    // Aucun placeholder {{}} restant
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it('EMAIL_SUBJECTS["payment-failed"] inclut l\'order ID', () => {
    const subject = EMAIL_SUBJECTS['payment-failed']({ ORDER_ID: 'SIN-48312' });
    expect(subject).toContain('SIN-48312');
    expect(subject).toMatch(/paiement/i);
  });
});

describe('sendPaymentFailedEmail', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('queue avec label payment-failed:<orderId> + RETRY_URL self-serve (Round 25 #5)', async () => {
    vi.doMock('@/lib/emails/queue', () => ({
      queueEmail: vi.fn(async () => ({ sent: true, id: 'del_1' })),
    }));

    const { sendPaymentFailedEmail } = await import('@/lib/emails/send');
    const { queueEmail } = await import('@/lib/emails/queue');

    await sendPaymentFailedEmail({
      order: {
        id: 'order_99',
        sinaliteOrderId: null,
        userId: 'u1',
      } as never,
      user: { email: 'test@plio.ca', firstName: 'Test', name: null } as never,
      failureReason: 'Carte refusée',
    });

    expect(queueEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(queueEmail).mock.calls[0][0];
    expect(call.template).toBe('payment-failed');
    expect(call.label).toBe('payment-failed:order_99');
    expect(call.vars.FAILURE_REASON).toBe('Carte refusée');
    // Round 25 #5 — RETRY_URL pointe vers /payment/retry/[orderId]?t=TOKEN
    // (Plus vers /order/start — eviter de forcer le rebuild du cart)
    expect(String(call.vars.RETRY_URL)).toMatch(/\/payment\/retry\/order_99\?t=[0-9a-f]{32}/);
    // ORDER_ID fallback to id.slice(-6).toUpperCase() when no sinaliteOrderId
    expect(String(call.vars.ORDER_ID)).toBe('DER_99');
  });

  it('utilise sinaliteOrderId si dispo', async () => {
    vi.doMock('@/lib/emails/queue', () => ({
      queueEmail: vi.fn(async () => ({ sent: true, id: 'del_2' })),
    }));

    const { sendPaymentFailedEmail } = await import('@/lib/emails/send');
    const { queueEmail } = await import('@/lib/emails/queue');

    await sendPaymentFailedEmail({
      order: { id: 'order_x', sinaliteOrderId: 'SIN-77', userId: 'u1' } as never,
      user: { email: 't@p.ca', firstName: 'T', name: null } as never,
      failureReason: 'Insufficient funds',
    });

    const call = vi.mocked(queueEmail).mock.calls[0][0];
    expect(call.vars.ORDER_ID).toBe('SIN-77');
  });
});

describe('handlePaymentFailed (stripe-process integration)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('marquer l\'order FAILED PUIS envoyer l\'email customer', async () => {
    const markFailedMock = vi.fn(async () => undefined);
    const sendFailedMock = vi.fn(async () => ({ sent: true, id: 'del_1' }));
    const findUniqueMock = vi.fn(async () => ({
      id: 'order_fail_1',
      paymentIntentId: 'pi_fail',
      sinaliteOrderId: null,
      user: { id: 'u1', email: 'angry@customer.ca', firstName: 'Angry', name: null },
    }));

    vi.doMock('@/lib/db', () => ({
      prisma: { order: { findUnique: findUniqueMock } },
    }));
    vi.doMock('@/lib/db/orders', () => ({
      markOrderFailed: markFailedMock,
      OrderNotFoundError: class extends Error {},
      // unused but imported in stripe-process
      markPaid: vi.fn(),
      attachSinaliteOrder: vi.fn(),
      markRefundIssued: vi.fn(),
      recordWebhookEvent: vi.fn(),
      updateWebhookOutcome: vi.fn(),
    }));
    vi.doMock('@/lib/emails/send', () => ({
      sendOrderConfirmationEmail: vi.fn(),
      sendOrderCancelledEmail: vi.fn(),
      sendPaymentFailedEmail: sendFailedMock,
      sendRefundIssuedEmail: vi.fn(),
    }));
    vi.doMock('@/lib/sinalite/client', () => ({ sinalite: {} }));

    const { processStripeEvent } = await import('@/lib/webhooks/stripe-process');

    const ctx: { orderId?: string } = {};
    await processStripeEvent(
      {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_fail',
            last_payment_error: {
              message: 'Your card was declined.',
              code: 'card_declined',
            },
          },
        },
      } as never,
      ctx,
    );

    expect(markFailedMock).toHaveBeenCalledTimes(1);
    expect(sendFailedMock).toHaveBeenCalledTimes(1);
    const emailArgs = (sendFailedMock.mock.calls as unknown as Array<[{ user: { email: string }; failureReason: string }]>)[0]?.[0];
    expect(emailArgs?.user.email).toBe('angry@customer.ca');
    expect(emailArgs?.failureReason).toBe('Your card was declined.');
    expect(ctx.orderId).toBe('order_fail_1');
  });

  it('si l\'email fail, on log mais on ne re-throw pas (best-effort)', async () => {
    vi.doMock('@/lib/db', () => ({
      prisma: { order: { findUnique: vi.fn(async () => ({
        id: 'o1', paymentIntentId: 'pi_x', sinaliteOrderId: null,
        user: { id: 'u1', email: 't@p.ca', firstName: 'T', name: null },
      })) } },
    }));
    vi.doMock('@/lib/db/orders', () => ({
      markOrderFailed: vi.fn(async () => undefined),
      OrderNotFoundError: class extends Error {},
      markPaid: vi.fn(), attachSinaliteOrder: vi.fn(), markRefundIssued: vi.fn(),
      recordWebhookEvent: vi.fn(), updateWebhookOutcome: vi.fn(),
    }));
    vi.doMock('@/lib/emails/send', () => ({
      sendOrderConfirmationEmail: vi.fn(),
      sendOrderCancelledEmail: vi.fn(),
      sendPaymentFailedEmail: vi.fn(async () => {
        throw new Error('SES down');
      }),
      sendRefundIssuedEmail: vi.fn(),
    }));
    vi.doMock('@/lib/sinalite/client', () => ({ sinalite: {} }));

    const { processStripeEvent } = await import('@/lib/webhooks/stripe-process');

    // Doit pas throw
    await expect(
      processStripeEvent(
        {
          type: 'payment_intent.payment_failed',
          data: { object: { id: 'pi_x', last_payment_error: null } },
        } as never,
        {},
      ),
    ).resolves.toBeUndefined();
  });
});
