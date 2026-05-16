/**
 * GET /api/designs/[id]/pdf
 *
 * Retourne le PDF print-ready stocké du DesignDraft. Auth optional pour MVP
 * (peut être consommé par /order/upload via fetch).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api-helpers';
import { prisma } from '@/lib/db';

const ParamsSchema = z.object({ id: z.string().min(1) });

export const GET = withErrorHandler(async (
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) => {
  const { id } = ParamsSchema.parse(await ctx.params);
  const draft = await prisma.designDraft.findUnique({ where: { id } });
  if (!draft?.finalPdfUrl) {
    return NextResponse.json({ error: 'Design not found' }, { status: 404 });
  }

  // Le finalPdfUrl est une data: URL — on parse et on stream les bytes
  const match = draft.finalPdfUrl.match(/^data:application\/pdf;base64,(.+)$/);
  if (!match) {
    return NextResponse.json({ error: 'Invalid stored PDF format' }, { status: 500 });
  }
  const bytes = Buffer.from(match[1], 'base64');

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="design-${id}.pdf"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});
