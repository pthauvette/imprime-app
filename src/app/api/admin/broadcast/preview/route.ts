/**
 * POST /api/admin/broadcast/preview
 *
 * Render le template admin-custom-message avec les vars d'un draft de
 * broadcast — l'admin voit le HTML exact que le destinataire va recevoir
 * (incluant footer unsubscribe, header brand, etc.).
 *
 * Ne touche pas à la DB, ne queue rien. Pur render preview.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { renderEmail } from '@/lib/emails/render';

const BodySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

  // On utilise des valeurs placeholder pour les vars dépendantes du destinataire
  // (unsubscribe URL, etc.) — le preview est "tel qu'un destinataire générique
  // le verra", pas une simulation par-destinataire.
  const html = renderEmail('admin-custom-message', {
    ORDER_ID: 'PREVIEW',
    SUBJECT: body.subject,
    PREVIEW: body.body.slice(0, 120).replace(/\n/g, ' '),
    BODY_HTML: textToHtml(body.body),
    ORDER_URL: `${baseUrl}/account`,
    SENDER_NAME: 'Équipe Plio',
    SENDER_EMAIL: guard.user.email,
    UNSUBSCRIBE_URL: `${baseUrl}/newsletter/unsubscribe?email=preview%40plio.ca&token=PREVIEW`,
  });

  return NextResponse.json({ ok: true, html });
});
