/**
 * dispatchBroadcast — idempotence par destinataire (audit-vérif H2).
 *
 * Le reaper du cron broadcasts ré-arme un broadcast bloqué >15 min (process
 * crashé). Avant, dispatchBroadcast re-bouclait sur TOUS les destinataires →
 * doublons. On verrouille : (1) sans livraison antérieure → tous envoyés avec un
 * label PAR-DESTINATAIRE ; (2) destinataires déjà livrés (run précédent) →
 * SAUTÉS (skipped), aucun ré-envoi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    emailDelivery: { findMany: vi.fn(async () => []) },
    emailBroadcast: { update: vi.fn(async () => ({})) },
  },
}));

vi.mock('@/lib/broadcast/recipients', () => ({
  resolveRecipients: vi.fn(async () => ['a@x.com', 'b@x.com', 'c@x.com']),
}));

vi.mock('@/lib/emails/send', () => ({
  sendAdminCustomMessageEmail: vi.fn(async () => ({ sent: true, id: 'del_x' })),
}));

vi.mock('@/lib/newsletter/token', () => ({
  newsletterUnsubscribeToken: vi.fn(() => 'tok'),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, debug: noop, child: () => stub };
  return { logEmail: stub, log: stub };
});

import { prisma } from '@/lib/db';
import { resolveRecipients } from '@/lib/broadcast/recipients';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { dispatchBroadcast } from '@/lib/broadcast/dispatch';

const findMany = vi.mocked(prisma.emailDelivery.findMany);
const send = vi.mocked(sendAdminCustomMessageEmail);

const broadcast = {
  id: 'bc_test_1',
  subject: 'Sujet',
  body: 'Corps du message assez long pour passer.',
  segment: 'newsletter',
  adminEmail: 'admin@plio.ca',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveRecipients).mockResolvedValue(['a@x.com', 'b@x.com', 'c@x.com']);
  send.mockResolvedValue({ sent: true, id: 'del_x' } as never);
});

describe('dispatchBroadcast — idempotence par destinataire (H2)', () => {
  it('aucune livraison antérieure → tous envoyés avec un label PAR-DESTINATAIRE', async () => {
    findMany.mockResolvedValueOnce([] as never);

    const res = await dispatchBroadcast(broadcast);

    expect(res).toEqual({ enqueued: 3, skipped: 0, requested: 3 });
    expect(send).toHaveBeenCalledTimes(3);
    // chaque envoi porte un label broadcast:<id>:<email>
    const labels = send.mock.calls.map((c) => (c[0] as { label: string }).label);
    expect(labels).toEqual([
      'broadcast:bc_test_1:a@x.com',
      'broadcast:bc_test_1:b@x.com',
      'broadcast:bc_test_1:c@x.com',
    ]);
  });

  it('re-run après crash : destinataires déjà livrés → SAUTÉS, pas de ré-envoi', async () => {
    // a@ et b@ ont déjà une livraison pour ce broadcast (run précédent).
    findMany.mockResolvedValueOnce([
      { label: 'broadcast:bc_test_1:a@x.com' },
      { label: 'broadcast:bc_test_1:b@x.com' },
    ] as never);

    const res = await dispatchBroadcast(broadcast);

    expect(res).toEqual({ enqueued: 1, skipped: 2, requested: 3 });
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0]![0] as { to: string }).to).toBe('c@x.com');
  });

  it('segment vidé → SENT avec 0, skipped 0', async () => {
    vi.mocked(resolveRecipients).mockResolvedValueOnce([]);
    const res = await dispatchBroadcast(broadcast);
    expect(res).toEqual({ enqueued: 0, skipped: 0, requested: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
