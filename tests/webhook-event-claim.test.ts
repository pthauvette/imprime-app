/**
 * recordWebhookEvent — claim-based dedup (Audit v2 #2.2/#2.3).
 *
 * Avant : la row de dédup était insérée AVANT le traitement avec
 * `success @default(true)`. Un échec transitoire du handler (blip DB, overdraft
 * wallet, Sinalite+refund KO) laissait la row en place → chaque retry Stripe/SNS
 * re-tombait sur P2002 → `isNew:false` → 200 `deduped` SANS retraiter. Le retry
 * automatique était neutralisé.
 *
 * Maintenant : la row démarre `success=false` (CLAIM) ; updateWebhookOutcome la
 * flippe à `true` au succès. On ne déduplique (`alreadyCompleted=true`) QUE si
 * une tentative précédente a réussi. Un échec/in-flight (`success=false`) →
 * `alreadyCompleted=false` → le caller re-traite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createMock = vi.fn();
const findUniqueMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    webhookEvent: {
      create: (...args: unknown[]) => createMock(...args),
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { logWebhook: { info: noop, warn: noop, error: noop } };
});

import { recordWebhookEvent } from '@/lib/db/orders';

const P2002 = { code: 'P2002' }; // forme minimale reconnue par isPrismaUniqueError

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordWebhookEvent — claim pessimiste (#2.2)', () => {
  it('nouvelle row → create avec success=false (claim), isNew=true, alreadyCompleted=false', async () => {
    createMock.mockResolvedValueOnce({ id: 'wh_1' });

    const r = await recordWebhookEvent({
      source: 'STRIPE', eventId: 'evt_1', eventType: 'payment_intent.succeeded', payload: '{}',
    });

    expect(r).toEqual({ isNew: true, alreadyCompleted: false });
    const data = createMock.mock.calls[0]![0].data;
    expect(data.success).toBe(false); // démarre non-confirmé
    expect(data.source).toBe('STRIPE');
    expect(data.eventId).toBe('evt_1');
  });

  it('P2002 + tentative précédente RÉUSSIE → alreadyCompleted=true (dedup légitime)', async () => {
    createMock.mockRejectedValueOnce(P2002);
    findUniqueMock.mockResolvedValueOnce({ success: true });

    const r = await recordWebhookEvent({
      source: 'STRIPE', eventId: 'evt_done', eventType: 'x',
    });

    expect(r).toEqual({ isNew: false, alreadyCompleted: true });
  });

  it('P2002 + tentative précédente ÉCHOUÉE → alreadyCompleted=false (à re-traiter)', async () => {
    createMock.mockRejectedValueOnce(P2002);
    findUniqueMock.mockResolvedValueOnce({ success: false });

    const r = await recordWebhookEvent({
      source: 'STRIPE', eventId: 'evt_failed', eventType: 'x',
    });

    expect(r).toEqual({ isNew: false, alreadyCompleted: false });
  });

  it('P2002 + row introuvable (race) → alreadyCompleted=false (safe : re-traiter)', async () => {
    createMock.mockRejectedValueOnce(P2002);
    findUniqueMock.mockResolvedValueOnce(null);

    const r = await recordWebhookEvent({ source: 'SES', eventId: 'm1', eventType: 'Bounce' });

    expect(r).toEqual({ isNew: false, alreadyCompleted: false });
  });

  it('erreur non-P2002 → rethrow (ne pas masquer une vraie panne DB)', async () => {
    createMock.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      recordWebhookEvent({ source: 'SINALITE', eventId: 'f1', eventType: 'SHIPPED' }),
    ).rejects.toThrow(/connection reset/);
  });
});
