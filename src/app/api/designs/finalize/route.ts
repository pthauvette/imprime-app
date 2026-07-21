/**
 * POST /api/designs/finalize
 *
 * Body: { templateSlug: string, values: Record<string,string> }
 * Returns: { designId, productId, pdfDataUrl }
 *
 * Crée un DesignDraft persistant en DB avec le PDF généré stocké en
 * data URL (MVP — pas encore d'upload S3). Auth optional : si pas de session,
 * on persiste sous un user "guest@plio.local" anonyme — il sera réattaché
 * via findOrCreateUserByEmail au moment du checkout.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { getTemplateBySlug } from '@/lib/templates/registry';
import { renderTemplateToPdf } from '@/lib/templates/render';
import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { GUEST_COOKIE, newGuestToken, setGuestCookie } from '@/lib/auth/guest-token';
import { cookies } from 'next/headers';

const BodySchema = z.object({
  templateSlug: z.string(),
  values: z.record(z.string(), z.string()),
  // Présent quand on re-finalize un brouillon repris depuis /drafts. On met
  // alors à jour CE draft (valeurs + PDF régénéré) au lieu d'en créer un
  // nouveau — sinon « Continuer » puis « Commander » dupliquerait le brouillon.
  draftId: z.string().optional(),
});

const GUEST_EMAIL = 'guest@plio.local';

export const POST = withErrorHandler(async (req: Request) => {
  // Audit v2 #6.3 — endpoint public (auth optionnelle) qui rend un PDF (Lambda
  // compute) + écrit en DB. Rate-limit par IP (bucket 'render', comme
  // /api/designs/render) avant tout travail coûteux.
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);

  const template = getTemplateBySlug(body.templateSlug);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // Render le PDF — Uint8Array → base64 data URL
  const pdfBytes = await renderTemplateToPdf(template, body.values);
  const pdfDataUrl =
    'data:application/pdf;base64,' + Buffer.from(pdfBytes).toString('base64');

  // Trouve ou crée l'user — session si connecté, sinon guest sentinel
  const session = await auth();
  const user = session?.user
    ? { id: session.user.id }
    : await prisma.user.upsert({
        where: { email: GUEST_EMAIL },
        create: { email: GUEST_EMAIL, firstName: 'Guest', lastName: 'Design' },
        update: {},
      });

  // Cloisonnement des INVITÉS (P1-5). Tous partagent la row `guest@plio.local`,
  // donc `userId` ne les sépare pas entre eux : il faut une 2e clé, propre au
  // navigateur. Pour un compte réel, `userId` suffit → `guestToken` reste null.
  const isGuest = !session?.user;
  let guestToken: string | null = null;
  let guestTokenIsNew = false;
  if (isGuest) {
    const existing = (await cookies()).get(GUEST_COOKIE)?.value;
    guestToken = existing ?? newGuestToken();
    guestTokenIsNew = !existing;
  }

  const templateId = await getOrCreateTemplateDbRow(template);

  // Reprise d'un brouillon : on met à jour le draft existant SI il appartient
  // à cet user et n'est pas déjà commandé (orderId null). updateMany filtre
  // par userId → un draftId d'un autre user ne matche rien (pas de fuite, pas
  // de mutation cross-user) et on retombe sur la création d'un nouveau draft.
  let draft: { id: string } | null = null;
  if (body.draftId) {
    const updated = await prisma.designDraft.updateMany({
      // Pour un invité on exige EN PLUS le guestToken : sans lui, deux invités
      // (même userId) pouvaient s'écraser mutuellement. Un draft d'invité créé
      // avant ce correctif a `guestToken: null` → ne matche aucun jeton, donc
      // n'est plus reprenable : perte volontaire (fail-closed) plutôt qu'une
      // clause `OR null` qui rouvrirait exactement le trou qu'on ferme.
      where: { id: body.draftId, userId: user.id, orderId: null, ...(isGuest ? { guestToken } : {}) },
      data: { values: JSON.stringify(body.values), finalPdfUrl: pdfDataUrl, templateId },
    });
    if (updated.count === 1) draft = { id: body.draftId };
  }

  // Pas de draftId (ou draft non repris/non possédé) → nouveau DesignDraft.
  if (!draft) {
    draft = await prisma.designDraft.create({
      data: {
        userId: user.id,
        templateId,
        values: JSON.stringify(body.values),
        finalPdfUrl: pdfDataUrl,
        guestToken,
      },
      select: { id: true },
    });
  }

  const res = NextResponse.json({
    designId: draft.id,
    productId: template.defaultSinalite.productId,
    productType: template.productType,
  });
  // Seulement si on vient de le tirer : re-poser un cookie existant à chaque
  // appel rallongerait sa durée de vie sans raison.
  if (guestToken && guestTokenIsNew) setGuestCookie(res, guestToken);
  return res;
});

/**
 * Le registry de templates est en TS (pas en DB), mais DesignDraft.templateId
 * pointe vers une row DB. On crée un row "shadow" par slug à la volée la
 * première fois qu'un user finalize ce template. Migration vers DB-only à
 * faire quand on aura une admin UI.
 */
async function getOrCreateTemplateDbRow(
  template: ReturnType<typeof getTemplateBySlug> & {},
): Promise<string> {
  return prisma.template
    .upsert({
      where: { slug: template.slug },
      create: {
        slug: template.slug,
        name: template.name,
        description: template.description,
        productType: template.productType,
        variant: template.variant,
        side: template.side,
        data: JSON.stringify(template.pdfme),
      },
      update: {
        // Keep shadow row in sync with code if template definition changes
        name: template.name,
        description: template.description,
        data: JSON.stringify(template.pdfme),
      },
    })
    .then((t) => t.id);
}
