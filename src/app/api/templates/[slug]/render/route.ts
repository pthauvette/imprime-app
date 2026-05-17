/**
 * POST /api/templates/[slug]/render
 *
 * Body: { values: Record<string, string>, mode?: 'inline' | 'attachment' }
 * Returns: application/pdf bytes.
 *
 * Pas d'auth requise pour le preview — n'importe qui peut "essayer" un
 * template. La finalisation (sauvegarde en DesignDraft + upload S3) sera
 * un endpoint séparé qui exige l'auth.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { getTemplateBySlug } from '@/lib/templates/registry';
import { renderTemplateToPdf } from '@/lib/templates/render';
import { rateLimit, clientIp } from '@/lib/ratelimit';

const BodySchema = z.object({
  values: z.record(z.string(), z.string()),
  mode: z.enum(['inline', 'attachment']).optional().default('inline'),
});

export const POST = withErrorHandler(async (
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) => {
  // Rate limit AVANT le parsing — pdfme render coûte ~200ms Lambda
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const { slug } = await ctx.params;
  const template = getTemplateBySlug(slug);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const body = await parseBody(req, BodySchema);
  const pdfBytes = await renderTemplateToPdf(template, body.values);

  const disposition = body.mode === 'attachment'
    ? `attachment; filename="${slug}.pdf"`
    : 'inline';

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  });
});
