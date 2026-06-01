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
