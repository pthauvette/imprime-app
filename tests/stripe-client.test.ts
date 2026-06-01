/**
 * Régression Round 45 — lib/stripe/client.ts expose un getStripe() PARESSEUX.
 *
 * Avant, plusieurs routes faisaient `new Stripe(process.env.STRIPE_SECRET_KEY!)`
 * AU TOP-LEVEL → throw au chargement si la clé manquait → toutes ces routes
 * (webhooks stripe, orders/create, admin cancel/refund, stripe-process)
 * crashaient au boot/build. Même fragilité fail-hard que l'incident prod R42b
 * et que le client Sinalite. Ces tests verrouillent le comportement
 * fail-soft-à-l'import / fail-loud-à-l'usage.
 *
 * NB : ce fichier NE mocke PAS 'stripe' — on veut le vrai constructeur pour
 * vérifier la mémoïsation. `new Stripe(key)` n'ouvre aucune connexion réseau,
 * il stocke juste la clé, donc c'est sûr en test.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

describe('stripe/client — getStripe() paresseux (R45)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('n’throw PAS à l’import quand STRIPE_SECRET_KEY manque (fail-soft à l’import)', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.resetModules();
    await expect(import('@/lib/stripe/client')).resolves.toBeDefined();
  });

  it('lève une erreur CLAIRE au 1er appel si la clé manque (fail-loud à l’usage)', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.resetModules();
    const { getStripe } = await import('@/lib/stripe/client');
    expect(() => getStripe()).toThrowError(/STRIPE_SECRET_KEY absent/);
  });

  it('retourne un client mémoïsé (même instance) quand la clé est présente', async () => {
    // setup.ts fournit STRIPE_SECRET_KEY=sk_test_dummy.
    vi.resetModules();
    const { getStripe } = await import('@/lib/stripe/client');
    expect(getStripe()).toBe(getStripe());
  });
});
