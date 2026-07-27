/**
 * POST /api/order/send-continue-link
 *
 * finding [74], docs/experience-client-2026-07.md : « porte de sortie "finir
 * sur mon ordinateur" — lien envoyé par courriel, l'URL contient déjà tout
 * l'état ». Le wizard porte déjà tout son état dans la query string
 * (productId/options/files/designId) — ce endpoint ne fait qu'emailer cette
 * URL exacte à l'adresse fournie, pour que le client puisse continuer sur un
 * autre appareil.
 *
 * SÉCURITÉ — endpoint anonyme qui envoie un courriel à une adresse arbitraire :
 *   - `path` DOIT commencer par exactement "/order/" et exclure les caractères
 *     qui casseraient l'attribut href="{{CONTINUE_URL}}" du template (le
 *     renderer fait une substitution brute, SANS échappement HTML) — sinon
 *     injection HTML dans le courriel. `APP_URL` (constante serveur, jamais
 *     dérivée de l'input) précède TOUJOURS `path` → aucun schéma/host arbitraire
 *     n'est possible même si `path` contenait "://" quelque part.
 *   - rate-limit PAR EMAIL (bucket `continueLink`, 5/h) — anti-spam d'une
 *     victime, même raisonnement qu'abandoned-cart (cf. ratelimit.ts).
 *   - rate-limit PAR IP (bucket `render`, 30/min) — anti-enrôlement en masse.
 *   - withErrorHandler applique déjà assertSameOrigin (CSRF repo-wide #347).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { sendContinueOnDeviceEmail } from '@/lib/emails/send';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

// Doit commencer par "/order/" ; exclut espace/guillemets/chevrons (casseraient
// l'attribut href du template — le renderer ne fait pas d'échappement HTML).
const SAFE_PATH_RE = /^\/order\/[^\s"'<>]*$/;

const BodySchema = z.object({
  email: z.string().trim().email().max(150),
  path: z.string().min(8).max(500).regex(SAFE_PATH_RE, 'Chemin non autorisé'),
});

export const POST = withErrorHandler(async (req: Request) => {
  const ipLimit = await rateLimit('render', clientIp(req));
  if (!ipLimit.ok) return ipLimit.response;

  const body = await parseBody(req, BodySchema);
  const email = body.email.toLowerCase();

  const emailLimit = await rateLimit('continueLink', email);
  if (!emailLimit.ok) return emailLimit.response;

  const result = await sendContinueOnDeviceEmail({ to: email, continueUrl: `${APP_URL}${body.path}` });
  return NextResponse.json({ ok: true, sent: result.sent });
});
