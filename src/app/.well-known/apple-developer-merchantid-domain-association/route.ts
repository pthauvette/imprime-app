/**
 * GET /.well-known/apple-developer-merchantid-domain-association
 *
 * Apple Pay sur le web exige qu'Apple puisse vérifier que TU possèdes
 * vraiment plio.ca. Le mécanisme : Stripe Dashboard te donne un blob
 * de texte unique → tu dois le servir à cette URL exacte → Stripe pique
 * le fichier et l'envoie à Apple pour vérification.
 *
 * Setup :
 *   1. Stripe Dashboard → Settings → Apple Pay → Add domain → plio.ca
 *   2. Stripe te donne le contenu du fichier (~7 lignes alphanumériques)
 *   3. Mettre dans Amplify env var APPLE_PAY_DOMAIN_ASSOCIATION
 *   4. Cliquer "Verify" dans Stripe Dashboard
 *
 * Sans cette étape, le bouton Apple Pay ne s'affiche pas (Stripe le hide
 * silencieusement). Google Pay n'a pas cette contrainte — fonctionne dès
 * que automatic_payment_methods est enabled côté PaymentIntent.
 *
 * Pas d'env var = 404 (pas encore configuré).
 */

const APPLE_PAY_DOMAIN_ASSOCIATION = process.env.APPLE_PAY_DOMAIN_ASSOCIATION;

export const runtime = 'nodejs';
export const dynamic = 'force-static'; // contenu fixe, cache CDN OK

export async function GET() {
  if (!APPLE_PAY_DOMAIN_ASSOCIATION) {
    return new Response('Apple Pay domain not yet configured', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new Response(APPLE_PAY_DOMAIN_ASSOCIATION, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      // Apple sniff peut prendre quelques minutes — cache court pour
      // permettre une re-verification rapide si on regen le token.
      'Cache-Control': 'public, max-age=60',
    },
  });
}
