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

const BodySchema = z.object({
  templateSlug: z.string(),
  values: z.record(z.string(), z.string()),
});

const GUEST_EMAIL = 'guest@plio.local';

export const POST = withErrorHandler(async (req: Request) => {
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

  // Persiste le DesignDraft
  const draft = await prisma.designDraft.create({
    data: {
      userId: user.id,
      templateId: await getOrCreateTemplateDbRow(template),
      values: JSON.stringify(body.values),
      finalPdfUrl: pdfDataUrl,
    },
  });

  return NextResponse.json({
    designId: draft.id,
    productId: template.defaultSinalite.productId,
    productType: template.productType,
  });
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
