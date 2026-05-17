/**
 * GET /api/newsletter/unsubscribe?email=X&token=Y
 *
 * Self-serve unsubscribe link (à inclure dans tous les emails newsletter).
 * Token = HMAC(email, AUTH_SECRET) — vérifie que l'unsubscribe vient bien
 * du destinataire de l'email (pas un random bot).
 *
 * GET au lieu de POST parce que les clients email rendent les liens en GET
 * et certains MUA cliquent automatiquement les liens pour scanner — on doit
 * être idempotent et safe à appeler N fois.
 *
 * Pas de rate-limit (legit unsubscribes ne doivent jamais être bloqués).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';

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

  if (token !== newsletterUnsubscribeToken(email)) {
    return new NextResponse('Lien invalide ou expiré.', { status: 400 });
  }

  // Update status — idempotent (no error si déjà UNSUBSCRIBED ou inexistant)
  await prisma.newsletterSubscriber.updateMany({
    where: { email, status: 'ACTIVE' },
    data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() },
  });
  log.info({ email }, 'newsletter unsubscribed');

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
