/**
 * POST /api/samples
 *
 * Crée une demande d'échantillons. Pas d'auth requise — public.
 * Anti-abuse :
 *   - Rate-limit via bucket 'signin' (5 req/15min/IP) — strict car
 *     l'endpoint est public et coûteux côté ops (kit physique à envoyer).
 *   - Soft check : 1 demande par email par 30 jours. Si déjà en cours
 *     (PENDING ou SHIPPED récent), on retourne 409 avec message friendly
 *     plutôt que de spammer l'admin.
 *
 * Notification admin : email aux ADMIN_EMAILS via sendAdminCustomMessageEmail
 * (reply-to = email du customer pour répondre direct).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { logEmail as log } from '@/lib/logger';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const BodySchema = z.object({
  email: z.string().email().max(150),
  name: z.string().min(1).max(150),
  phone: z.string().max(30).optional(),
  shipLine1: z.string().min(1).max(200),
  shipLine2: z.string().max(200).optional(),
  shipCity: z.string().min(1).max(100),
  shipProvince: z.enum(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']),
  shipPostalCode: z.string().regex(/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, 'Format postal canadien attendu (A1A 1A1)'),
  selectedSamples: z.array(z.string().min(1).max(80)).min(1).max(5),
  message: z.string().max(2000).optional(),
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const POST = withErrorHandler(async (req: Request) => {
  // Rate-limit serré (endpoint public + ops coûteuses)
  const limit = await rateLimit('signin', clientIp(req));
  if (!limit.ok) return limit.response;

  const body = await parseBody(req, BodySchema);
  const emailNormalized = body.email.toLowerCase().trim();
  const postalNormalized = body.shipPostalCode.toUpperCase().replace(/\s/g, '');

  // Soft anti-abuse : 1 demande par email par 30 jours
  const recentRequest = await prisma.sampleRequest.findFirst({
    where: {
      email: emailNormalized,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (recentRequest) {
    return NextResponse.json(
      {
        error: `Tu as déjà demandé des échantillons le ${recentRequest.createdAt.toLocaleDateString('fr-CA')}. On limite à 1 envoi par mois — écris-nous à bonjour@plio.ca si tu as besoin d'autres options spécifiques.`,
        code: 'DUPLICATE_RECENT',
      },
      { status: 409 },
    );
  }

  // Persist
  const reqIp = clientIp(req);
  const reqUa = req.headers.get('user-agent') ?? null;
  const request = await prisma.sampleRequest.create({
    data: {
      email: emailNormalized,
      name: body.name.trim(),
      phone: body.phone?.trim() ?? null,
      shipLine1: body.shipLine1.trim(),
      shipLine2: body.shipLine2?.trim() ?? null,
      shipCity: body.shipCity.trim(),
      shipProvince: body.shipProvince,
      shipPostalCode: postalNormalized,
      selectedSamples: JSON.stringify(body.selectedSamples),
      message: body.message?.trim() ?? null,
      requestIp: reqIp ?? null,
      requestUa: reqUa,
    },
  });

  // Notification admin (best-effort, ne fail pas la requête si email fail)
  if (ADMIN_EMAILS.length > 0) {
    const sampleList = body.selectedSamples
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join('\n');
    const html = `
      <p><strong>${escapeHtml(body.name)}</strong> (${escapeHtml(body.email)})${body.phone ? ` · ${escapeHtml(body.phone)}` : ''}</p>
      <p>Demande <strong>${body.selectedSamples.length}</strong> échantillon${body.selectedSamples.length > 1 ? 's' : ''} :</p>
      <ul>${sampleList}</ul>
      <p><strong>Livraison :</strong><br>
        ${escapeHtml(body.shipLine1)}${body.shipLine2 ? `<br>${escapeHtml(body.shipLine2)}` : ''}<br>
        ${escapeHtml(body.shipCity)}, ${escapeHtml(body.shipProvince)} ${escapeHtml(postalNormalized)}
      </p>
      ${body.message ? `<p><strong>Message :</strong></p><p style="padding:12px; background:#f7f7f7; border-radius:6px;">${escapeHtml(body.message)}</p>` : ''}
      <p style="margin-top:24px;"><a href="${APP_URL}/admin/samples">Voir dans l'admin →</a></p>
    `;

    const subject = `[Samples] ${body.name} demande ${body.selectedSamples.length} échantillon${body.selectedSamples.length > 1 ? 's' : ''}`;
    for (const adminEmail of ADMIN_EMAILS) {
      try {
        await sendAdminCustomMessageEmail({
          to: adminEmail,
          replyTo: body.email,
          vars: {
            ORDER_ID: request.id.slice(-6).toUpperCase(),
            SUBJECT: subject,
            PREVIEW: `${body.name} demande des échantillons à expédier au ${body.shipCity}, ${body.shipProvince}`,
            BODY_HTML: html,
            ORDER_URL: `${APP_URL}/admin/samples`,
            SENDER_NAME: body.name,
            SENDER_EMAIL: body.email,
          },
        });
      } catch (err) {
        log.error({ err, adminEmail, requestId: request.id }, 'sample request admin notification failed');
      }
    }
  }

  // Slack notification info-level — kit physique à préparer
  await sendCriticalAlert({
    severity: 'info',
    title: `📦 Nouveau kit d'échantillons à expédier · ${body.name}`,
    body: `${body.selectedSamples.length} échantillon(s) demandé(s) : ${body.selectedSamples.join(', ')}\n\nLivraison : ${body.shipCity}, ${body.shipProvince}`,
    context: { email: body.email },
    actionUrl: `${APP_URL}/admin/samples`,
    actionLabel: 'Voir dans /admin/samples',
  });

  return NextResponse.json({ ok: true, id: request.id });
});
