/**
 * POST /api/auth/sms/send — gardes d'un endpoint ANONYME et PAYANT.
 *
 * Ce que ces tests protègent réellement : chaque appel qui atteint Twilio coûte
 * de l'argent. Une régression ici ne casse pas une page, elle ouvre une facture.
 * D'où l'insistance sur les REFUS et sur l'ORDRE des vérifications.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const envoyerCode = vi.fn(async () => ({ ok: true as const, statut: 'pending' }));
const smsAuthDisponible = vi.fn(() => true);
const rateLimit = vi.fn(async () => ({ ok: true as const, remaining: 9 }));
let rateLimitEnabled = true;

vi.mock('@/lib/auth/twilio-verify', () => ({
  envoyerCode: (...a: unknown[]) => envoyerCode(...(a as [])),
  smsAuthDisponible: () => smsAuthDisponible(),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...(a as [])),
  get rateLimitEnabled() { return rateLimitEnabled; },
  clientIp: () => '1.2.3.4',
}));

vi.mock('@/lib/logger', () => ({
  logAuth: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function req(body: unknown) {
  return new Request('http://localhost/api/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitEnabled = true;
  smsAuthDisponible.mockReturnValue(true);
  rateLimit.mockResolvedValue({ ok: true as const, remaining: 9 });
  envoyerCode.mockResolvedValue({ ok: true as const, statut: 'pending' });
});

describe('POST /api/auth/sms/send', () => {
  it('envoie un code pour un numéro canadien valide', async () => {
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '(514) 555-0123' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, masque: '••• ••• 0123' });
    // Twilio reçoit le numéro NORMALISÉ, pas la saisie brute.
    expect(envoyerCode).toHaveBeenCalledWith('+15145550123');
  });

  it('ne divulgue jamais le numéro complet dans la réponse', async () => {
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '5145550123' }));
    expect(JSON.stringify(await res.json())).not.toContain('5145550123');
  });

  it('REFUSE quand le limiteur est inerte — fail-CLOSED', async () => {
    // LE test central. `rateLimit()` laisse passer par défaut quand Upstash
    // n'est pas configuré (choix assumé pour les chemins de revenu). Sur un
    // endpoint PAYANT ce défaut est une facture ouverte : cette route doit
    // refuser explicitement. Si ce test tombe, la protection a sauté.
    rateLimitEnabled = false;
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '5145550123' }));
    expect(res.status).toBe(503);
    expect(envoyerCode).not.toHaveBeenCalled();
  });

  it('répond 404 tant que la fonctionnalité n’est pas configurée', async () => {
    smsAuthDisponible.mockReturnValue(false);
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '5145550123' }));
    expect(res.status).toBe(404);
    expect(envoyerCode).not.toHaveBeenCalled();
  });

  it('refuse un numéro américain SANS consommer de jeton de limitation', async () => {
    // L'ordre compte : si on limitait avant de valider le pays, un attaquant
    // épuiserait les compteurs des vrais clients avec des numéros qu'on
    // n'aurait de toute façon jamais servis.
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '212 555 0123' }));
    expect(res.status).toBe(400);
    expect(rateLimit).not.toHaveBeenCalled();
    expect(envoyerCode).not.toHaveBeenCalled();
  });

  it('refuse un corps invalide sans appeler Twilio', async () => {
    const { POST } = await import('@/app/api/auth/sms/send/route');
    for (const corps of [{}, { phone: '' }, { phone: 'abc' }]) {
      const res = await POST(req(corps));
      expect(res.status).toBe(400);
    }
    expect(envoyerCode).not.toHaveBeenCalled();
  });

  it('applique les TROIS bornes : numéro, IP, plafond global', async () => {
    // Les deux premières se contournent en faisant tourner IP et numéros ;
    // seule la borne agrégée plafonne la facture.
    const { POST } = await import('@/app/api/auth/sms/send/route');
    await POST(req({ phone: '5145550123' }));
    const buckets = rateLimit.mock.calls.map((c) => (c as unknown as [string, string])[0]);
    expect(buckets).toEqual(['smsSend', 'smsSendIp', 'smsSendGlobal']);
  });

  it('s’arrête à la PREMIÈRE borne dépassée, sans envoyer', async () => {
    const refus = {
      ok: false as const,
      response: new Response('rate limited', { status: 429 }) as never,
    };
    rateLimit.mockResolvedValueOnce(refus as never);
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '5145550123' }));
    expect(res.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledTimes(1);
    expect(envoyerCode).not.toHaveBeenCalled();
  });

  it('renvoie une erreur neutre si Twilio échoue', async () => {
    envoyerCode.mockResolvedValueOnce({ ok: false, erreur: 'indisponible' } as never);
    const { POST } = await import('@/app/api/auth/sms/send/route');
    const res = await POST(req({ phone: '5145550123' }));
    expect(res.status).toBe(502);
    // Pas de détail technique côté client.
    expect(JSON.stringify(await res.json())).not.toMatch(/twilio|indisponible_/i);
  });
});
