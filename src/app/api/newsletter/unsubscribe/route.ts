/**
 * GET /api/newsletter/unsubscribe?email=X&token=Y    (legacy auto-trigger)
 * POST /api/newsletter/unsubscribe?email=X&token=Y   (called by confirmation page)
 *
 * Self-serve unsubscribe. Token = HMAC(email, AUTH_SECRET).
 *
 * GET garde le comportement legacy (auto-unsubscribe + HTML response) pour
 * backward-compat avec les emails déjà envoyés qui pointent ici. Les
 * nouveaux emails pointent vers /newsletter/unsubscribe (page de confirmation
 * explicite) qui POST ici.
 *
 * Pas de rate-limit (legit unsubscribes ne doivent jamais être bloqués).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';
import { timingSafeStringEqual } from '@/lib/webhooks/sinalite-signature';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // new URL(req.url) marche en runtime Next.js prod ET dans les tests qui
  // passent plain Request. req.nextUrl serait préférable mais cassait nos
  // tests vitest qui ne wrappent pas en NextRequest.
  const url = new URL(req.url);
  const email = url.searchParams.get('email')?.trim().toLowerCase();
  const token = url.searchParams.get('token');

  if (!email || !token) {
    return new NextResponse('Paramètres manquants.', { status: 400 });
  }

  // Audit v2 #6.7 — comparaison constant-time du HMAC.
  if (!timingSafeStringEqual(token, newsletterUnsubscribeToken(email))) {
    return new NextResponse('Lien invalide ou expiré.', { status: 400 });
  }

  // Update status — idempotent (no error si déjà UNSUBSCRIBED ou inexistant).
  // Audit v2 #7.7 — on désabonne AUSSI User.emailMarketing (comme le POST RFC
  // 8058). Avant, le GET ne touchait que la table NewsletterSubscriber → un user
  // auth-ed qui cliquait le lien GED continuait de recevoir broadcasts admin,
  // reseller-monthly-stats et reengagement (qui gardent sur user.emailMarketing).
  await Promise.all([
    prisma.newsletterSubscriber.updateMany({
      where: { email, status: 'ACTIVE' },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    }),
    prisma.user.updateMany({
      where: { email, emailMarketing: true },
      data: { emailMarketing: false },
    }),
  ]);
  log.info({ email }, 'newsletter + marketing unsubscribed (GET)');

  // Render confirmation HTML (page minimale, pas de chrome Plio)
  return new NextResponse(
    `<!doctype html>
<html lang="fr-CA">
<head>
  <meta charset="utf-8">
  <title>Désabonnement confirmé · Plio</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 24px; color: #141C16; line-height: 1.5; }
    h1 { font-family: Georgia, serif; font-size: 32px; color: #1F3D2B; margin: 0 0 16px; }
    p { color: #4A554D; }
    a { color: #1F3D2B; }
  </style>
</head>
<body>
  <h1>Désabonnement confirmé.</h1>
  <p>L'adresse <strong>${escapeHtml(email)}</strong> ne recevra plus de communications marketing de Plio.</p>
  <p>Tu continueras de recevoir les emails transactionnels (confirmation de commande, suivi de livraison) si tu commandes — ces emails sont essentiels au service et ne sont pas concernés par le désabonnement marketing.</p>
  <p>Tu as changé d'avis ? <a href="https://plio.ca">Re-abonne-toi depuis le footer</a> de plio.ca.</p>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * POST variant — appelé par la confirmation page /newsletter/unsubscribe.
 * Même token vérif que GET, retourne JSON. Idempotent.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email')?.trim().toLowerCase();
  const token = url.searchParams.get('token');

  if (!email || !token) {
    return NextResponse.json({ error: 'Missing email/token' }, { status: 400 });
  }
  // Audit v2 #6.7 — comparaison constant-time du HMAC.
  if (!timingSafeStringEqual(token, newsletterUnsubscribeToken(email))) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Round 28 #4 — RFC 8058 expects POST to unsubscribe immediately, sans
  // confirmation page. On exécute les 2 updates en parallèle :
  //   1. NewsletterSubscriber (audience legacy)
  //   2. User.emailMarketing (audience auth-ed customer — couvre les
  //      broadcasts admin, reseller monthly stats, reengagement)
  // Idempotent : pas d'erreur si déjà UNSUBSCRIBED ou si user pas dans
  // la table — updateMany retourne juste { count: 0 }.
  await Promise.all([
    prisma.newsletterSubscriber.updateMany({
      where: { email, status: 'ACTIVE' },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
    }),
    prisma.user.updateMany({
      where: { email, emailMarketing: true },
      data: { emailMarketing: false },
    }),
  ]);
  log.info({ email, source: 'one-click-post' }, 'newsletter + marketing unsubscribed');

  return NextResponse.json({ ok: true });
}
