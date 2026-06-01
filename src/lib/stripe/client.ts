/**
 * Client Stripe — server-side only.
 *
 * Accès PARESSEUX (getStripe()) : Stripe n'est instancié qu'à la 1re
 * utilisation, jamais au chargement du module.
 *
 * Avant (Round < 45), plusieurs routes faisaient
 *   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, …)
 * AU TOP-LEVEL → `new Stripe(undefined)` throw si la clé manquait, ce qui
 * crashait au boot/build TOUTES les routes important ce module (webhooks
 * stripe, orders/create, admin cancel/refund, stripe-process…) pour une seule
 * var manquante. Même fragilité fail-hard que l'incident prod R42b (corrigé
 * dans lib/env.ts + instrumentation.ts) et que le client Sinalite (R45).
 *
 * Désormais : fail-soft à l'import, fail-loud à l'usage — une clé manquante
 * lève une erreur CLAIRE au moment de l'appel Stripe, pas au chargement.
 *
 * NB : les routes wallet/* et health gèrent volontairement l'absence de clé
 * par un ternaire `KEY ? new Stripe() : null` (dégradation gracieuse) ; elles
 * n'utilisent pas ce helper et restent telles quelles.
 */

import Stripe from 'stripe';

// apiVersion centralisée — était dupliquée dans chaque route.
const STRIPE_API_VERSION = '2025-02-24.acacia';

let cached: Stripe | null = null;

/**
 * Retourne un client Stripe mémoïsé (singleton). Lève une erreur claire si
 * STRIPE_SECRET_KEY manque — au moment de l'appel, jamais au chargement.
 */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'Configuration Stripe manquante : STRIPE_SECRET_KEY absent. ' +
        "Vérifie les variables d'env (console Amplify / .env).",
    );
  }
  cached = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return cached;
}
