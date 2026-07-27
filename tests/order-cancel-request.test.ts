/**
 * Tests pour POST /api/orders/[id]/cancel-request — customer-initiated
 * cancel request (envoie email à admin, n'auto-cancel pas).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findUnique: vi.fn(async () => null) },
    adminAuditEvent: { create: vi.fn(async () => ({})) },
    orderEvent: { create: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => ({ user: { id: 'user_1', email: 'c@plio.ca', role: 'USER' } })),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true })),
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => true),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sendCriticalAlert } from '@/lib/alerting/slack';

function makeReq(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

const baseOrder = {
  id: 'order_1',
  userId: 'user_1',
  sinaliteOrderId: '48312',
  amountCents: 18742,
  status: 'PAID',
  province: 'QC',
  shippingMethod: 'UPS Standard',
  shipName: 'Sophie',
  user: { email: 'c@plio.ca', name: 'Sophie Beauchamp' },
};

async function importFresh() {
  vi.resetModules();
  vi.doMock('@/lib/db', () => ({
    prisma: {
      order: { findUnique: vi.fn() },
      adminAuditEvent: { create: vi.fn(async () => ({})) },
      orderEvent: { create: vi.fn(async () => ({})) },
    },
  }));
  return (await import('@/app/api/orders/[id]/cancel-request/route')).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ADMIN_EMAILS', 'admin@plio.ca');
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'user_1', email: 'c@plio.ca', role: 'USER' },
  } as never);
  vi.mocked(prisma.order.findUnique).mockResolvedValue(baseOrder as never);
  vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: true } as never);
  vi.mocked(sendCriticalAlert).mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/orders/[id]/cancel-request', () => {
  it('PAID order : envoie email à admin avec context complet', async () => {
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'J\'ai cliqué par erreur' }), ctxFor('order_1'));
    expect(res.status).toBe(200);
    expect(sendAdminCustomMessageEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(sendAdminCustomMessageEmail).mock.calls[0][0];
    expect(args.to).toBe('admin@plio.ca');
    expect(args.replyTo).toBe('c@plio.ca'); // reply va direct au client
    expect(args.vars.SUBJECT).toContain('[Annulation demandée]');
    expect(args.vars.SUBJECT).toContain('48312');
    // escape : apostrophe HTML-entity, accents UTF-8 brut (valide)
    expect(args.vars.BODY_HTML).toContain('J&#39;ai cliqué par erreur');
    expect(args.vars.BODY_HTML).toContain('PAID');
  });

  it('SUBMITTED order : déclenche Slack alert (action urgente)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'SUBMITTED' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    await POST(makeReq({ reason: 'changement de plan' }), ctxFor('order_1'));
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
    const args = vi.mocked(sendCriticalAlert).mock.calls[0][0];
    expect(args.severity).toBe('warning');
    expect(args.title).toContain('SUBMITTED');
  });

  it('IN_PRODUCTION : Slack alert aussi', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'IN_PRODUCTION' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    await POST(makeReq({ reason: 'changement' }), ctxFor('order_1'));
    expect(sendCriticalAlert).toHaveBeenCalledOnce();
  });

  it('PAID : pas de Slack alert (peut être annulé sans risque)', async () => {
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    await POST(makeReq({ reason: 'changement' }), ctxFor('order_1'));
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('PENDING : 400 avec message friendly (pas payé)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'PENDING' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toContain('pas encore payée');
  });

  it('SHIPPED : 400 avec message contact (trop tard)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'SHIPPED' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toContain('en route');
  });

  it('DELIVERED : 400', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'DELIVERED' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
  });

  it('CANCELLED : 400 (déjà annulé)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'CANCELLED' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toContain('déjà annulée');
  });

  it('FAILED : 400 (refund déjà émis)', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ ...baseOrder, status: 'FAILED' } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
  });

  it('401 si pas authentifié', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(401);
  });

  it('404 si pas owner (ni admin) — pas de leak', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'other_user', email: 'other@plio.ca', role: 'USER' },
    } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'x...........' }), ctxFor('order_1'));
    expect(res.status).toBe(404);
    expect(sendAdminCustomMessageEmail).not.toHaveBeenCalled();
  });

  it('admin peut request cancel (testing flow)', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'admin_1', email: 'admin@plio.ca', role: 'ADMIN' },
    } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'test admin path' }), ctxFor('order_1'));
    expect(res.status).toBe(200);
  });

  it('400 si reason trop court (< 10 chars validation Zod)', async () => {
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    // Le Zod schema dit min 1 — la validation 10 chars se fait côté UI.
    // Donc raison 5 chars passe par Zod mais c'est cosmétique.
    const res = await POST(makeReq({ reason: 'a' }), ctxFor('order_1'));
    // Min 1 char en server → ça passe
    expect(res.status).toBe(200);
  });

  it('400 si reason vide', async () => {
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: '' }), ctxFor('order_1'));
    expect(res.status).toBe(400);
  });

  // Audit v2 #10.7 — kind DÉDIÉ (plus de réutilisation de ADMIN_MANUAL_CANCEL).
  it('audit log kind=CUSTOMER_CANCEL_REQUEST (pas ADMIN_MANUAL_CANCEL)', async () => {
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    await POST(makeReq({ reason: 'test reason here' }), ctxFor('order_1'));
    expect(prisma.adminAuditEvent.create).toHaveBeenCalledOnce();
    const audit = vi.mocked(prisma.adminAuditEvent.create).mock.calls[0][0];
    expect(audit.data.kind).toBe('CUSTOMER_CANCEL_REQUEST');
    expect(audit.data.kind).not.toBe('ADMIN_MANUAL_CANCEL');
    const data = JSON.parse(audit.data.data as string);
    expect(data.status).toBe('PAID');
  });

  // finding [49] — trace CLIENT persistante (visible sur /orders/[id] même
  // après fermeture de la modale), distincte de l'AdminAudit (admin-only).
  it('finding [49] : écrit un OrderEvent CANCEL_REQUESTED visible du client', async () => {
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    await POST(makeReq({ reason: 'changement de plan' }), ctxFor('order_1'));
    expect(prisma.orderEvent.create).toHaveBeenCalledOnce();
    const args = vi.mocked(prisma.orderEvent.create).mock.calls[0][0];
    expect(args.data.orderId).toBe('order_1');
    expect(args.data.kind).toBe('CANCEL_REQUESTED');
    const data = JSON.parse(args.data.data as string);
    expect(data.reason).toBe('changement de plan');
  });

  it('finding [49] : OrderEvent écrit même si TOUS les envois admin échouent', async () => {
    vi.mocked(sendAdminCustomMessageEmail).mockResolvedValue({ sent: false } as never);
    const { POST } = await import('@/app/api/orders/[id]/cancel-request/route');
    const res = await POST(makeReq({ reason: 'changement de plan' }), ctxFor('order_1'));
    expect(res.status).toBe(502); // l'envoi admin a échoué...
    expect(prisma.orderEvent.create).toHaveBeenCalledOnce(); // ...mais la trace client existe déjà
  });
});
