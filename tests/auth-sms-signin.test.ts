/**
 * Connexion par code SMS — la fonction qui décide « ce numéro ouvre-t-il
 * cette session ».
 *
 * Deux propriétés comptent plus que le chemin passant :
 *  1. elle ne CRÉE jamais de compte (sinon on contourne la vérification du
 *     courriel exigée à l'inscription) ;
 *  2. elle ne distingue jamais « code erroné » de « numéro sans compte »
 *     (sinon elle devient un oracle d'énumération de clientèle).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifierCode = vi.fn();
const smsAuthDisponible = vi.fn(() => true);
const findUnique = vi.fn();
const warn = vi.fn();
const info = vi.fn();

vi.mock('@/lib/auth/twilio-verify', () => ({
  verifierCode: (...a: unknown[]) => verifierCode(...(a as [])),
  smsAuthDisponible: () => smsAuthDisponible(),
}));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) } },
}));
vi.mock('@/lib/logger', () => ({ logAuth: { warn, info, error: vi.fn() } }));

const COMPTE = { id: 'u_1', email: 'sophie@studio.ca', name: 'Sophie', image: null };

beforeEach(() => {
  vi.clearAllMocks();
  smsAuthDisponible.mockReturnValue(true);
  verifierCode.mockResolvedValue({ ok: true, statut: 'approved' });
  findUnique.mockResolvedValue(COMPTE);
});

describe('connexionParSms', () => {
  it('ouvre la session quand le code est bon et le numéro rattaché', async () => {
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await expect(connexionParSms('(514) 555-0123', '123456')).resolves.toEqual(COMPTE);
    // Twilio reçoit le numéro NORMALISÉ.
    expect(verifierCode).toHaveBeenCalledWith('+15145550123', '123456');
  });

  it('cherche le compte sur phoneVerified, JAMAIS sur phone', async () => {
    // `phone` est saisi librement au checkout : n'importe qui peut y inscrire
    // le numéro d'un tiers. S'en servir ici serait une prise de contrôle.
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await connexionParSms('5145550123', '123456');
    const where = (findUnique.mock.calls[0] as unknown as [{ where: object }])[0].where;
    expect(where).toEqual({ phoneVerified: '+15145550123' });
    expect(JSON.stringify(where)).not.toContain('"phone"');
  });

  it('refuse un code erroné', async () => {
    verifierCode.mockResolvedValue({ ok: false, erreur: 'code_invalide' });
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await expect(connexionParSms('5145550123', '000000')).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('NE CRÉE PAS de compte quand le numéro est inconnu', async () => {
    // Créer ici ouvrirait un compte sans courriel vérifié et contournerait le
    // modèle d'identité (courriel ET téléphone vérifiés à l'inscription).
    findUnique.mockResolvedValue(null);
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await expect(connexionParSms('5145550123', '123456')).resolves.toBeNull();
  });

  it('ne distingue pas « code erroné » de « numéro sans compte »', async () => {
    const { connexionParSms } = await import('@/lib/auth/sms-signin');

    verifierCode.mockResolvedValue({ ok: false, erreur: 'code_invalide' });
    const mauvaisCode = await connexionParSms('5145550123', '000000');

    verifierCode.mockResolvedValue({ ok: true, statut: 'approved' });
    findUnique.mockResolvedValue(null);
    const sansCompte = await connexionParSms('5145550123', '123456');

    // Résultats indiscernables → aucun oracle d'énumération.
    expect(mauvaisCode).toBeNull();
    expect(sansCompte).toBeNull();
    expect(mauvaisCode).toEqual(sansCompte);
  });

  it('ne journalise jamais le numéro en clair', async () => {
    // Donnée personnelle (Loi 25) : elle ne doit pas atteindre CloudWatch.
    findUnique.mockResolvedValue(null);
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await connexionParSms('5145550123', '123456');
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('5145550123');
    expect(JSON.stringify(warn.mock.calls)).toContain('0123'); // 4 derniers seulement
  });

  it('refuse un numéro non canadien sans appeler Twilio', async () => {
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await expect(connexionParSms('212 555 0123', '123456')).resolves.toBeNull();
    expect(verifierCode).not.toHaveBeenCalled();
  });

  it('reste inerte tant que la fonctionnalité n’est pas configurée', async () => {
    smsAuthDisponible.mockReturnValue(false);
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    await expect(connexionParSms('5145550123', '123456')).resolves.toBeNull();
    expect(verifierCode).not.toHaveBeenCalled();
  });

  it('refuse une entrée absente ou malformée', async () => {
    const { connexionParSms } = await import('@/lib/auth/sms-signin');
    for (const [tel, code] of [[null, null], [undefined, '123456'], ['', ''], ['abc', 'xyz']]) {
      await expect(connexionParSms(tel, code)).resolves.toBeNull();
    }
  });
});
