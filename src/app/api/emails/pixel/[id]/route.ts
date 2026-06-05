/**
 * GET /api/emails/pixel/[id]
 *
 * Pixel transparent 1x1 GIF embedded dans les emails transactionnels.
 * Quand le client mail charge les images, ce hit nous signale l'open.
 *
 * Comportement :
 *   - 1ère fois → set openedAt + openCount = 1
 *   - N-ième fois → openCount += 1 (la 1ère ouverture est figée)
 *   - id invalide / row introuvable → quand même retourner 1x1 (pas de leak
 *     si une URL est devinée + pas de broken image dans Gmail)
 *
 * Limites :
 *   - Outlook desktop bloque les images par défaut → on sous-estime
 *   - iOS Mail Privacy Protection préfetch tout → on sur-estime
 *   - Industry baseline : open rate "vrai" probablement 50-70% du tracké
 *
 * Pas de redirect (vs un pixel JS) — un GIF 43 bytes c'est tout ce qu'on
 * a besoin. Cache-Control: no-store pour avoir 1 hit par ouverture.
 */

import { prisma } from '@/lib/db';
import { logEmail } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 1×1 transparent GIF (42 bytes). Hardcoded — pas besoin de lib. */
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  // On AWAIT : recordOpen est non-throwing (try/catch interne) et l'insert est
  // ~qq ms — négligeable vs le timeout image (secondes) côté client mail. Un
  // `void` ici serait GELÉ sur Lambda (le conteneur freeze au return) → opens
  // sous-comptés/perdus. (suite #322/#323)
  await recordOpen(id);

  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
      // no-store pour avoir 1 hit par ouverture (sinon Gmail proxy cache).
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
    },
  });
}

async function recordOpen(deliveryId: string): Promise<void> {
  // Defensive : id format invalide → silent skip
  if (!deliveryId || deliveryId.length < 10 || deliveryId.length > 50) return;

  try {
    // First write : si openedAt est null, set + count = 1.
    // Subsequent : count += 1, openedAt unchanged (la 1ère ouverture stays figée).
    await prisma.$executeRaw`
      UPDATE "EmailDelivery"
      SET "openedAt" = COALESCE("openedAt", NOW()),
          "openCount" = "openCount" + 1
      WHERE "id" = ${deliveryId}
    `;
  } catch (err) {
    // DB down or id introuvable → log mais on ne casse pas l'image
    logEmail.warn({ err, deliveryId }, 'pixel open record failed');
  }
}
