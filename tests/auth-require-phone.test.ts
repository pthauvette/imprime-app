/**
 * Garde « téléphone vérifié obligatoire ».
 *
 * Le test qui compte n'est pas « redirige-t-il bien ? » mais « peut-il
 * enfermer tout le monde dehors ? ». Un verrou d'accès qui se trompe ne
 * dégrade pas une page : il rend le produit inutilisable, y compris pour
 * l'admin censé poser la configuration qui le débloquerait.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();
const findUnique = vi.fn();
const smsAuthDisponible = vi.fn(() => true);
const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });

vi.mock('@/auth', () => ({ auth: () => auth() }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...(a as [])) } } }));
vi.mock('@/lib/auth/twilio-verify', () => ({ smsAuthDisponible: () => smsAuthDisponible() }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

/** Exécute le garde et renvoie l'URL de redirection, ou null s'il a laissé passer. */
async function lancer(): Promise<string | null> {
  const { exigerTelephoneVerifie } = await import('@/lib/auth/require-phone');
  try {
    await exigerTelephoneVerifie('/orders');
    return null;
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (m) return m[1]!;
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  smsAuthDisponible.mockReturnValue(true);
  auth.mockResolvedValue({ user: { id: 'u_1' } });
  findUnique.mockResolvedValue({ phoneVerified: null });
});

describe('exigerTelephoneVerifie', () => {
  it('INERTE tant que la connexion par SMS n’est pas configurée', async () => {
    // LE test de sûreté. Aucun compte n'a de `phoneVerified`, et la page de
    // vérification ne pourrait envoyer aucun code : verrouiller ici
    // enfermerait TOUT LE MONDE dehors, sans porte de sortie. La
    // fonctionnalité doit s'activer par la CONFIGURATION, jamais par le
    // simple déploiement de ce code.
    smsAuthDisponible.mockReturnValue(false);
    expect(await lancer()).toBeNull();
    // Il ne doit même pas interroger la base.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('redirige un compte sans numéro vérifié, avec le chemin de retour', async () => {
    expect(await lancer()).toBe('/onboarding/telephone?next=%2Forders');
  });

  it('laisse passer un compte déjà vérifié', async () => {
    findUnique.mockResolvedValue({ phoneVerified: '+15145550123' });
    expect(await lancer()).toBeNull();
  });

  it('ne redirige PAS un visiteur anonyme — ce n’est pas son rôle', async () => {
    // Sans session, la page applique déjà sa propre redirection vers /sign-in.
    // Agir ici enverrait un anonyme vers la vérification au lieu de la
    // connexion.
    auth.mockResolvedValue(null);
    expect(await lancer()).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('encode le chemin de retour porteur d’une query', async () => {
    // Non encodé, `/order/configure?productId=1` serait tronqué au `?` et
    // l'utilisateur perdrait ce qu'il faisait.
    const { exigerTelephoneVerifie } = await import('@/lib/auth/require-phone');
    try {
      await exigerTelephoneVerifie('/order/configure?productId=1');
    } catch { /* redirect simulé */ }
    expect(redirect).toHaveBeenCalledWith(
      '/onboarding/telephone?next=%2Forder%2Fconfigure%3FproductId%3D1',
    );
  });

  it('laisse passer si l’utilisateur est introuvable', async () => {
    // Compte supprimé alors qu'une session traîne : rediriger en boucle vers
    // une vérification impossible n'aiderait personne.
    findUnique.mockResolvedValue(null);
    expect(await lancer()).toBeNull();
  });
});
