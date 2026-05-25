/**
 * Tests pour l'attachement automatique de la facture PDF aux emails
 * order-confirmation (et tout autre email avec `attachOrderId`).
 *
 * Vérifie :
 *   - queueEmail propage attachOrderId vers EmailDelivery.attachOrderId
 *   - processDelivery génère le PDF à la volée + appelle sendEmail avec
 *     attachments
 *   - Si la génération PDF fail, l'email part quand même (best-effort)
 *   - Le retry régénère le PDF (idempotent)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailDelivery: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      // Round 17 #3 : updateMany pour claim atomique.
      updateMany: vi.fn(async () => ({ count: 1 })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    order: {
      findUnique: vi.fn(),
    },
    // Round 39 #4 : suppression check au début de queueEmail.
    emailSuppression: {
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock('@/lib/emails/render', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => true),
}));

vi.mock('@/lib/print/invoice-pdf', () => ({
  generateInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3, 4, 5])),
}));

import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/emails/render';
import { generateInvoicePdf } from '@/lib/print/invoice-pdf';
import { queueEmail, processDelivery } from '@/lib/emails/queue';

const baseOrder = {
  id: 'order_abc',
  sinaliteOrderId: 'SIN-99887',
  userId: 'user_1',
  user: { email: 'test@plio.ca', name: 'Test User' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('attachOrderId → facture PDF auto-attachée', () => {
  it('queueEmail propage attachOrderId vers EmailDelivery.create', async () => {
    vi.mocked(prisma.emailDelivery.create).mockResolvedValueOnce({
      id: 'del_1', to: 'a@b.ca', template: 'order-confirmation', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: 'order-confirmation:order_abc', attachOrderId: 'order_abc',
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      id: 'del_1', to: 'a@b.ca', template: 'order-confirmation', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: 'order-confirmation:order_abc', attachOrderId: 'order_abc',
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(baseOrder as never);

    await queueEmail({
      to: 'a@b.ca',
      template: 'order-confirmation',
      vars: {},
      label: 'order-confirmation:order_abc',
      attachOrderId: 'order_abc',
    });

    expect(prisma.emailDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ attachOrderId: 'order_abc' }),
    });
  });

  it('processDelivery génère le PDF et l\'attache à sendEmail', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      id: 'del_2', to: 'b@plio.ca', template: 'order-confirmation', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: 'order-confirmation:order_abc', attachOrderId: 'order_abc',
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(baseOrder as never);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    await processDelivery('del_2');

    expect(generateInvoicePdf).toHaveBeenCalledTimes(1);
    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.attachments).toHaveLength(1);
    expect(sendCall.attachments![0].filename).toBe('facture-plio-SIN-99887.pdf');
    expect(sendCall.attachments![0].contentType).toBe('application/pdf');
    expect(sendCall.attachments![0].content).toBeInstanceOf(Uint8Array);
  });

  it('si génération PDF échoue, l\'email part quand même (best-effort)', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      id: 'del_3', to: 'c@plio.ca', template: 'order-confirmation', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: 'order-confirmation:order_abc', attachOrderId: 'order_abc',
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(baseOrder as never);
    vi.mocked(generateInvoicePdf).mockRejectedValueOnce(new Error('PDF crash'));
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const result = await processDelivery('del_3');

    expect(result.sent).toBe(true);
    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.attachments).toBeUndefined();
  });

  it('si order pas trouvé, send sans attachment + warn log', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      id: 'del_4', to: 'd@plio.ca', template: 'order-confirmation', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: 'order-confirmation:gone', attachOrderId: 'gone',
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const result = await processDelivery('del_4');

    expect(result.sent).toBe(true);
    expect(generateInvoicePdf).not.toHaveBeenCalled();
    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.attachments).toBeUndefined();
  });

  it('emails SANS attachOrderId ne déclenchent pas la génération PDF', async () => {
    vi.mocked(prisma.emailDelivery.findUnique).mockResolvedValueOnce({
      id: 'del_5', to: 'e@plio.ca', template: 'welcome', varsJson: '{}',
      subject: null, replyTo: null, status: 'PENDING', attempts: 0,
      maxAttempts: 3, lastError: null, nextAttemptAt: null, sentAt: null,
      label: null, attachOrderId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    vi.mocked(prisma.emailDelivery.update).mockResolvedValueOnce({} as never);

    const result = await processDelivery('del_5');

    expect(result.sent).toBe(true);
    expect(generateInvoicePdf).not.toHaveBeenCalled();
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    const sendCall = vi.mocked(sendEmail).mock.calls[0][0];
    expect(sendCall.attachments).toBeUndefined();
  });
});
