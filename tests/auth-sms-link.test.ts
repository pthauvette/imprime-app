/**
 * POST /api/auth/sms/link — rattachement d'un numéro vérifié au compte connecté.
 *
 * C'est le point où un numéro devient une IDENTITÉ. Les tests visent donc
 * surtout ce qui doit être IMPOSSIBLE : rattacher sans session, rattacher sans
 * code valide, et voler le numéro déjà rattaché à quelqu'un d'autre.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
const verifierCode = vi.fn();
const smsAuthDisponible = vi.fn(() => true);
const findUnique = vi.fn();
const update = vi.fn();
const warn = vi.fn();

vi.mock('@/auth', () => ({ auth: () => auth() }));
vi.mock('@/lib/auth/twilio-verify', () => ({
  verifierCode: (...a: unknown[]) => verifierCode(...(a as [])),
  smsAuthDisponible: () => smsAuthDisponible(),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      update: (...a: unknown[]) => update(...(a as [])),
    },
  },
}));
vi.mock('@/lib/logger', () => ({ logAuth: { warn, info: vi.fn(), error: vi.fn() } }));

const req = (body: unknown) =>
  new Request('http://localhost/api/auth/sms/link', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const OK = { phone: '514 555-0123', code: '123456' };

beforeEach(() => {
  vi.clearAllMocks();
  smsAuthDisponible.mockReturnValue(true);
  auth.mockResolvedValue({ user: { id: 'u_1' } });
  verifierCode.mockResolvedValue({ ok: true, statut: 'approved' });
  findUnique.mockResolvedValue(null);
  update.mockResolvedValue({});
});

describe('POST /api/auth/sms/link', () => {
  it('rattache le numéro normalisé au compte connecté', async () => {
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req(OK));
    expect(res.status).toBe(200);
    const args = (update.mock.calls[0] as unknown as [{ where: unknown; data: Record<string, unknown> }])[0];
    expect(args.where).toEqual({ id: 'u_1' });
    expect(args.data.phoneVerified).toBe('+15145550123');
    expect(args.data.phoneVerifiedAt).toBeInstanceOf(Date);
  });

  it('REFUSE sans session — un rattachement modifie une identité', async () => {
    auth.mockResolvedValue(null);
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req(OK));
    expect(res.status).toBe(401);
    expect(verifierCode).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('REFUSE de voler un numéro déjà rattaché à un AUTRE compte', async () => {
    // Sans cette garde, « ce numéro → ce compte » deviendrait ambigu à la
    // connexion, et le dernier à rattacher raflerait l'identité.
    findUnique.mockResolvedValue({ id: 'u_autre' });
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req(OK));
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('reste idempotent sur SON PROPRE numéro', async () => {
    findUnique.mockResolvedValue({ id: 'u_1' });
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req(OK));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalled();
  });

  it('refuse un code invalide sans rien écrire', async () => {
    verifierCode.mockResolvedValue({ ok: false, erreur: 'code_invalide' });
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req({ ...OK, code: '000000' }));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuse un numéro non canadien sans appeler Twilio', async () => {
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req({ ...OK, phone: '212 555 0123' }));
    expect(res.status).toBe(400);
    expect(verifierCode).not.toHaveBeenCalled();
  });

  it('ne renvoie jamais le numéro complet', async () => {
    const { POST } = await import('@/app/api/auth/sms/link/route');
    const res = await POST(req(OK));
    expect(JSON.stringify(await res.json())).not.toContain('5145550123');
  });

  it('répond 404 tant que la fonctionnalité n’est pas configurée', async () => {
    smsAuthDisponible.mockReturnValue(false);
    const { POST } = await import('@/app/api/auth/sms/link/route');
    expect((await POST(req(OK))).status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
});
