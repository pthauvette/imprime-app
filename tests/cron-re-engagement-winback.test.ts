/**
 * GET /api/cron/re-engagement (win-back) — Audit v2 #7.2.
 *
 * Verrouille : le PromoCode n'est créé qu'APRÈS un envoi confirmé. Avant, il
 * était créé AVANT l'envoi → un opt-out (send sent:false sans EmailDelivery)
 * laissait un code orphelin recréé à chaque run.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    order: { findMany: vi.fn(async () => []), groupBy: vi.fn() },
    review: { findMany: vi.fn(async () => []) },
    emailDelivery: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn() },
    promoCode: { create: vi.fn(async () => ({ id: 'promo_1' })) },
  },
}));
vi.mock('@/lib/emails/send', () => ({
  sendReengagementFollowUpEmail: vi.fn(async () => ({ sent: true, id: 'e1' })),
  sendReengagementWinbackEmail: vi.fn(),
}));
vi.mock('@/lib/reviews/token', () => ({ reviewSubmitToken: vi.fn(() => 'tok') }));
vi.mock('@/lib/cron/healthcheck', () => ({ pingCronHealthcheck: vi.fn() }));
vi.mock('@/lib/cron/runs', () => ({ recordCronRun: vi.fn() }));
vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { prisma } from '@/lib/db';
import { sendReengagementWinbackEmail, sendReengagementFollowUpEmail } from '@/lib/emails/send';

const ORIG_ENV = { ...process.env };
function makeReq() {
  return new Request('http://localhost/api/cron/re-engagement', {
    headers: { authorization: 'Bearer test_secret' },
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIG_ENV, CRON_SECRET: 'test_secret', NODE_ENV: 'production' };
  vi.mocked(prisma.order.findMany).mockResolvedValue([] as never); // pas de follow-up
  vi.mocked(prisma.emailDelivery.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.order.groupBy).mockResolvedValue([
    { userId: 'u_1', _max: { createdAt: new Date(Date.now() - 120 * 864e5) } },
  ] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u_1', email: 'x@plio.ca', emailReengagement: true } as never);
});

describe('cron/re-engagement winback — #7.2', () => {
  it('opt-out (send sent:false) → AUCUN PromoCode créé (plus d\'orphelin)', async () => {
    vi.mocked(sendReengagementWinbackEmail).mockResolvedValueOnce({ sent: false, optedOut: true } as never);

    const { GET } = await import('@/app/api/cron/re-engagement/route');
    const res = await GET(makeReq());
    const json = await res.json();

    expect(sendReengagementWinbackEmail).toHaveBeenCalledTimes(1);
    expect(prisma.promoCode.create).not.toHaveBeenCalled(); // ← le fix
    expect(json.summary.winback.skipped).toBe(1);
    expect(json.summary.winback.sent).toBe(0);
  });

  it('envoi réussi → PromoCode créé APRÈS, avec le même code que l\'email', async () => {
    let emailedCode = '';
    vi.mocked(sendReengagementWinbackEmail).mockImplementationOnce(async (input: { promoCode: string }) => {
      emailedCode = input.promoCode;
      return { sent: true, id: 'e2' } as never;
    });

    const { GET } = await import('@/app/api/cron/re-engagement/route');
    const res = await GET(makeReq());
    const json = await res.json();

    expect(prisma.promoCode.create).toHaveBeenCalledTimes(1);
    const created = vi.mocked(prisma.promoCode.create).mock.calls[0]![0] as { data: { code: string; maxUses: number } };
    expect(created.data.code).toBe(emailedCode); // le code persté = celui envoyé
    expect(created.data.maxUses).toBe(1);
    expect(json.summary.winback.sent).toBe(1);
  });

  it('code create échoue APRÈS un envoi réussi → failed, pas de throw', async () => {
    vi.mocked(sendReengagementWinbackEmail).mockResolvedValueOnce({ sent: true, id: 'e3' } as never);
    vi.mocked(prisma.promoCode.create).mockRejectedValueOnce(new Error('unique collision'));

    const { GET } = await import('@/app/api/cron/re-engagement/route');
    const res = await GET(makeReq());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.summary.winback.failed).toBe(1);
  });
});

describe('cron/re-engagement follow-up — finding [106]', () => {
  const candidateOrder = {
    id: 'ord_1',
    user: { id: 'u_1', email: 'x@plio.ca', emailDeliveryNotifications: true },
  };

  it('avis DÉJÀ laissé pour cette commande → skip, aucun email envoyé', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([candidateOrder] as never);
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([{ orderId: 'ord_1' }] as never);

    const { GET } = await import('@/app/api/cron/re-engagement/route');
    const res = await GET(makeReq());
    const json = await res.json();

    expect(sendReengagementFollowUpEmail).not.toHaveBeenCalled();
    expect(json.summary.followUp.skipped).toBe(1);
    expect(json.summary.followUp.sent).toBe(0);
  });

  it('aucun avis laissé → la relance part normalement', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValueOnce([candidateOrder] as never);
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([] as never); // aucune review pour ce batch

    const { GET } = await import('@/app/api/cron/re-engagement/route');
    const res = await GET(makeReq());
    const json = await res.json();

    expect(sendReengagementFollowUpEmail).toHaveBeenCalledTimes(1);
    expect(json.summary.followUp.sent).toBe(1);
  });
});
