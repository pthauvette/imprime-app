/**
 * Secret de signature HMAC — source unique, fail-closed.
 *
 * POURQUOI CE MODULE (audit pré-lancement 2026-07, P0-5) : cinq modules de
 * signature faisaient `process.env.AUTH_SECRET ?? 'dev-secret'`. Ce repli est
 * dangereux parce que le fail-fast qui aurait dû l'empêcher a été
 * VOLONTAIREMENT désarmé après l'incident du 2026-05-30 : `parseEnv()` ne throw
 * plus (`src/lib/env.ts`) et `assertProductionEnvReady()` est appelée dans un
 * try/catch qui avale l'erreur (`src/instrumentation.ts`).
 *
 * Conséquence : si `AUTH_SECRET` manquait en production — exactement ce qui
 * s'est produit avec le bug de regex `amplify.yml` — le serveur démarrait et
 * signait les HMAC avec une constante PUBLIÉE DANS LE DÉPÔT.
 *
 * Impact concret, money-critical : `shippingQuoteToken` est le jeton que
 * `ENFORCE_SHIPPING_SIG` valide. Secret connu → un attaquant forge un devis de
 * livraison à `price: 0` (le format canonique est entièrement lisible dans le
 * code). Et `paymentRetryToken(orderId)` est déterministe et sans expiration →
 * accès à la page de paiement de n'importe quelle commande.
 *
 * RÈGLE : un module de signature doit REFUSER DE SIGNER, jamais signer faux.
 * Le fail-soft est le bon choix pour une page marketing ; jamais pour une clé
 * cryptographique. On throw donc dans TOUS les environnements — les tests
 * fournissent la variable via `tests/setup.ts`, et `.env.example` la documente.
 */

/** Longueur minimale — alignée sur le schéma zod (`env.ts`, `z.string().min(32)`). */
const MIN_LENGTH = 32;

/**
 * Retourne `AUTH_SECRET` ou lève. Ne JAMAIS remplacer par un repli : une
 * signature calculée avec un secret connu vaut moins qu'une absence de
 * signature, car elle inspire une confiance injustifiée.
 *
 * @param usage Nom du jeton concerné — apparaît dans l'erreur pour situer
 *              l'incident sans divulguer quoi que ce soit de sensible.
 */
export function signingSecret(usage: string): string {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error(
      `AUTH_SECRET absent — refus de signer « ${usage} ». ` +
        'Signer avec un secret par défaut permettrait de forger ce jeton. ' +
        'Poser AUTH_SECRET dans les variables d\'environnement.',
    );
  }

  if (secret.length < MIN_LENGTH) {
    throw new Error(
      `AUTH_SECRET trop court (${secret.length} < ${MIN_LENGTH}) — refus de signer « ${usage} ».`,
    );
  }

  return secret;
}
