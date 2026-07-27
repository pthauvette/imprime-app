/**
 * GET /api/templates/gabarit.pdf?w=&h=&bleed=&safe=&name=
 *
 * Gabarit d'impression téléchargeable — finding [22]/[116]/[130]. Public,
 * sans auth : ce n'est qu'une géométrie (trait de coupe/bleed/safe), aucune
 * donnée client. Les query params viennent directement de la page (marginSpec
 * déjà résolue + expectedDims si connue) — pas de résolution slug→spec ici,
 * pour ne pas dupliquer margin-specs.ts côté serveur.
 *
 * Bornes défensives sur w/h/bleed/safe : anti-abus (générer un PDF à une
 * taille pathologique gaspille du compute Lambda pour rien).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateTemplatePdf } from '@/lib/print/template-pdf';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const QuerySchema = z.object({
  w: z.coerce.number().min(0.25).max(60),
  h: z.coerce.number().min(0.25).max(60),
  bleed: z.coerce.number().min(0).max(1).default(0.125),
  safe: z.coerce.number().min(0).max(1).default(0.125),
  name: z.string().trim().max(80).optional(),
});

// new URL(req.url) marche en runtime Next.js prod ET dans les tests qui
// passent un plain Request. req.nextUrl serait préférable mais cassait les
// tests vitest qui ne wrappent pas en NextRequest (même pattern que
// /api/newsletter/unsubscribe/route.ts).
export async function GET(req: Request) {
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
  }
  const { w, h, bleed, safe, name } = parsed.data;

  try {
    const pdfBytes = await generateTemplatePdf({
      trimWidthIn: w,
      trimHeightIn: h,
      bleedIn: bleed,
      safeIn: safe,
      productName: name,
    });

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="plio-gabarit-${w}x${h}po.pdf"`,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    log.error({ err, w, h, bleed, safe }, 'gabarit pdf generation failed');
    return NextResponse.json({ error: 'Génération PDF échouée' }, { status: 500 });
  }
}
