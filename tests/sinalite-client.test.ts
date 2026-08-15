/**
 * Régression Round 45 — lib/sinalite/client.ts résout son env de façon
 * PARESSEUSE (getEnv() mémoïsé), plus via un IIFE `schema.parse()` au
 * chargement du module.
 *
 * Avant : importer le client avec des creds manquantes throwait à l'import →
 * toute route important ce client (webhooks stripe/sinalite, orders/create,
 * crons…) crashait au boot/build. Même fragilité fail-hard que l'incident
 * prod R42b. Ces tests verrouillent le comportement fail-soft-à-l'import /
 * fail-loud-à-l'usage pour éviter une régression.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('sinalite/client — résolution paresseuse de l’env (R45)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('n’throw PAS à l’import quand les creds manquent (fail-soft à l’import)', async () => {
    // Creds vidées → l’ancien IIFE eager aurait fait rejeter cet import.
    vi.stubEnv('SINALITE_CLIENT_ID', '');
    vi.stubEnv('SINALITE_CLIENT_SECRET', '');
    vi.resetModules();

    await expect(import('@/lib/sinalite/client')).resolves.toBeDefined();
  });

  it('lève un SinaliteError CLAIR au 1er usage si une creds manque (fail-loud à l’usage)', async () => {
    vi.stubEnv('SINALITE_CLIENT_ID', '');
    vi.stubEnv('SINALITE_CLIENT_SECRET', '');
    vi.resetModules();

    const mod = await import('@/lib/sinalite/client');
    // Accès au getter storeCode → getEnv() → message explicite, pas un
    // ZodError opaque ni un crash de tout le serveur.
    expect(() => mod.sinalite.storeCode).toThrowError(/Configuration Sinalite manquante/);
  });

  it('résout storeCode paresseusement quand les creds sont présentes', async () => {
    // setup.ts fournit les creds de test (SINALITE_STORE_CODE=en_ca).
    vi.resetModules();
    const mod = await import('@/lib/sinalite/client');
    expect(mod.sinalite.storeCode).toBe('en_ca');
  });
});

/**
 * Un échec du JETON doit porter son endpoint — sinon l'appelant ne peut pas
 * savoir si `/order/new` est parti.
 *
 * POURQUOI CE BLOC. `getToken()` s'exécute DANS `request()`, donc AVANT le
 * `fetch` de `/order/new`. Ses échecs réseau levaient des exceptions ANONYMES
 * (`DOMException` sur timeout, `SyntaxError` sur corps tronqué, `ZodError` sur
 * schéma inattendu). Le rejeu admin les classait donc « /order/new a été
 * émis, issue inconnue » : alerte critique mensongère et, depuis l'ajout du
 * marqueur durable, blocage jusqu'à intervention humaine — alors que RIEN
 * n'était parti. C'est le mode d'échec le plus fréquent : le jeton n'est mis
 * en cache que par conteneur, donc absent à chaque démarrage à froid.
 *
 * ⚠️ Ces tests exercent le CLIENT. Le test symétrique côté route
 * (`replay-sinalite-guards`) fabrique lui-même la `SinaliteError` : il prouve
 * que la route réagit bien, pas que le client la produit. Sans ce bloc-ci, la
 * chaîne complète n'était démontrée nulle part.
 */
describe('sinalite/client — un échec de jeton est PROUVABLEMENT pré-envoi', () => {
  const creds = () => {
    vi.stubEnv('SINALITE_CLIENT_ID', 'id');
    vi.stubEnv('SINALITE_CLIENT_SECRET', 'secret');
    vi.stubEnv('SINALITE_API_BASE', 'https://api.exemple.test');
    vi.stubEnv('SINALITE_AUTH_BASE', 'https://auth.exemple.test');
    vi.stubEnv('SINALITE_AUDIENCE', 'https://audience.exemple.test');
  };

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('rejet RÉSEAU → SinaliteError sur /auth/token, status 0', async () => {
    creds();
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    const { sinalite, SinaliteError } = await import('@/lib/sinalite/client');

    const err = await sinalite.listProducts().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SinaliteError);
    expect((err as InstanceType<typeof SinaliteError>).endpoint).toBe('/auth/token');
    expect((err as InstanceType<typeof SinaliteError>).status).toBe(0);
  });

  it('corps ILLISIBLE → SinaliteError sur /auth/token, pas une SyntaxError nue', async () => {
    creds();
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    }));
    const { sinalite, SinaliteError } = await import('@/lib/sinalite/client');

    const err = await sinalite.listProducts().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SinaliteError);
    expect((err as InstanceType<typeof SinaliteError>).endpoint).toBe('/auth/token');
    // `status: 0` = « aucune réponse exploitable ». C'est ce que l'appelant
    // pourrait vouloir distinguer d'un refus HTTP ; l'épingler ici évite qu'un
    // remaniement le remplace par un 503 trompeur.
    expect((err as InstanceType<typeof SinaliteError>).status).toBe(0);
  });

  it('schéma INATTENDU → SinaliteError sur /auth/token, pas un ZodError nu', async () => {
    creds();
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 12345 }), // type faux
    }));
    const { sinalite, SinaliteError } = await import('@/lib/sinalite/client');

    const err = await sinalite.listProducts().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SinaliteError);
    expect((err as InstanceType<typeof SinaliteError>).endpoint).toBe('/auth/token');
    expect((err as InstanceType<typeof SinaliteError>).status).toBe(0);
  });
});

describe('createOrder — un payload invalide DOIT se dire pré-envoi', () => {
  it('lève un SinaliteError d’endpoint `<payload>`, jamais un ZodError nu', async () => {
    // POURQUOI CE TEST. La validation locale s'exécute avant le moindre paquet,
    // donc elle PROUVE qu'aucune commande n'a été créée — mais un `ZodError`
    // nu ne porte pas cette preuve. Les deux chemins de soumission rangent
    // toute exception non reconnue en « issue inconnue » : marqueur durable,
    // aucun remboursement, blocage jusqu'à ce qu'un humain aille au portail.
    // Sur le webhook, un payload invalide — c'est-à-dire un bug de NOTRE
    // côté — aurait donc gelé chaque commande payée au lieu de la rembourser.
    //
    // Écrit après une campagne de mutation : étiqueter cette erreur
    // `/order/new` au lieu de `<payload>` ne faisait rougir AUCUN test.
    vi.resetModules();
    const { sinalite, SinaliteError } = await import('@/lib/sinalite/client');
    const { aucuneCreationPossible } = await import('@/lib/sinalite/submit-outcome');

    const err = await sinalite
      .createOrder({ items: [] } as never)
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SinaliteError);
    expect((err as InstanceType<typeof SinaliteError>).endpoint).toBe('<payload>');
    // Ce qui compte in fine : l'appelant peut en conclure « rien n'est parti ».
    expect(aucuneCreationPossible(err)).toBe(true);
  });
});
