/**
 * POST /api/admin/broadcast
 *
 * Envoie un broadcast email à un segment d'audience. Pour MVP :
 *   - Body texte brut, on le wrappe dans le template admin-custom-message
 *     (existant, déjà responsive, avec footer unsubscribe).
 *   - Enqueue via queueEmail (system existant avec retry + dead letter).
 *   - Pas de bcc/personnalization {{firstName}} pour MVP — on peut ajouter
 *     plus tard si engagement faiblit.
 *
 * GET /api/admin/broadcast?segment=newsletter → preview count uniquement.
 *
 * CASL : resolveRecipients filtre déjà les opt-outs et les implied consents
 * expirés. On audit log chaque broadcast.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import {
  resolveRecipients,
  previewRecipientCount,
  type BroadcastSegment,
} from '@/lib/broadcast/recipients';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';
import { logEmail as log } from '@/lib/logger';

const SegmentSchema = z.enum([
  'newsletter',
  'customers',
  'all',
  'tier-gold',
  'tier-silver',
  'tier-bronze',
  'inactive-90d',
]);

const BodySchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(20).max(10000),
  segment: SegmentSchema,
  notes: z.string().max(500).optional(),
  /** Confirme qu'admin a vu le preview count avant de send. Anti foot-gun. */
  confirmedCount: z.number().int().nonnegative(),
  /** Round 19 #4 — ISO datetime ou null/omitted = envoyer maintenant.
   *  Si présent + futur → status=SCHEDULED, cron processera. */
  scheduledAt: z.string().datetime().optional(),
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

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const segmentRaw = url.searchParams.get('segment') ?? 'newsletter';
  const segment = SegmentSchema.parse(segmentRaw);

  const count = await previewRecipientCount(segment);
  return NextResponse.json({ ok: true, segment, count });
});

export const POST = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await parseBody(req, BodySchema);
  const recipients = await resolveRecipients(body.segment as BroadcastSegment);

  // Guardrail : count actuel doit matcher le confirmedCount à ±10% (peut
  // changer un peu entre preview et send, mais pas du tout-au-tout).
  const drift = Math.abs(recipients.length - body.confirmedCount);
  const driftPct = body.confirmedCount > 0 ? drift / body.confirmedCount : 1;
  if (driftPct > 0.1 && drift > 5) {
    return NextResponse.json(
      {
        error: `Le nombre de destinataires a changé (preview : ${body.confirmedCount}, actuel : ${recipients.length}). Rafraîchis la page et re-vérifie avant d'envoyer.`,
        code: 'COUNT_DRIFT',
        actual: recipients.length,
      },
      { status: 409 },
    );
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'Aucun destinataire pour ce segment.', code: 'NO_RECIPIENTS' },
      { status: 400 },
    );
  }

  // Hard cap à 10 000 par broadcast pour MVP (au-delà → split en multi-batch).
  if (recipients.length > 10_000) {
    return NextResponse.json(
      { error: `Trop de destinataires (${recipients.length} > 10 000). Split en plusieurs broadcasts ou demande un raise du cap.`, code: 'TOO_LARGE' },
      { status: 400 },
    );
  }

  // Round 19 #4 — Check si on schedule pour le futur.
  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  const isFutureScheduled = scheduledAt !== null && scheduledAt.getTime() > Date.now() + 60_000;
  // Tolerance 1min : "maintenant" envoyé via scheduler = ok envoi immédiat

  const broadcast = await prisma.emailBroadcast.create({
    data: {
      subject: body.subject.trim(),
      body: body.body.trim(),
      segment: body.segment,
      recipientCount: recipients.length,
      status: isFutureScheduled ? 'SCHEDULED' : 'QUEUED',
      scheduledAt: isFutureScheduled ? scheduledAt : null,
      adminEmail: guard.user.email,
      notes: body.notes?.trim() ?? null,
    },
  });

  // Path 1 : programmé pour le futur — pas de send maintenant, le cron va.
  if (isFutureScheduled) {
    void recordAdminAudit({
      kind: 'ADMIN_RESEND_EMAIL',
      adminId: guard.userId,
      adminEmail: guard.user.email,
      targetType: 'USER',
      data: {
        action: 'BROADCAST_SCHEDULED',
        broadcastId: broadcast.id,
        segment: body.segment,
        subject: body.subject,
        scheduledAt: scheduledAt!.toISOString(),
        plannedRecipientCount: recipients.length,
      },
    });
    return NextResponse.json({
      ok: true,
      broadcastId: broadcast.id,
      scheduled: true,
      scheduledAt: scheduledAt!.toISOString(),
      plannedRecipients: recipients.length,
    });
  }

  // Path 2 : envoi immédiat — utilise le helper partagé avec le cron.
  const { dispatchBroadcast } = await import('@/lib/broadcast/dispatch');
  const { enqueued, requested } = await dispatchBroadcast({
    id: broadcast.id,
    subject: body.subject,
    body: body.body,
    segment: body.segment,
    adminEmail: guard.user.email,
  });

  void recordAdminAudit({
    kind: 'ADMIN_RESEND_EMAIL',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    data: {
      action: 'BROADCAST_SENT',
      broadcastId: broadcast.id,
      segment: body.segment,
      subject: body.subject,
      recipientCount: enqueued,
      requestedCount: requested,
    },
  });

  return NextResponse.json({
    ok: true,
    broadcastId: broadcast.id,
    enqueued,
    requested,
  });
});
