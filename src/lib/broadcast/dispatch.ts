/**
 * Broadcast dispatch helper — réutilisé par :
 *   - POST /api/admin/broadcast (envoi immédiat)
 *   - GET /api/cron/broadcasts (envoi des SCHEDULED dont scheduledAt < now)
 *
 * Round 19 #4. Pourquoi extrait : éviter dup logique entre route admin
 * et cron. Si on change un détail (preview format, CASL footer), 1 endroit.
 */

import { prisma } from '@/lib/db';
import { resolveRecipients, type BroadcastSegment } from '@/lib/broadcast/recipients';
import { sendAdminCustomMessageEmail } from '@/lib/emails/send';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';
import { logEmail as log } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

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
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Envoie le broadcast à tous ses recipients (re-resolve segment au moment
 * du send, pas au moment du schedule — la liste peut avoir changé).
 *
 * Mark le broadcast SENT + recipientCount = enqueued en fin. Renvoie le
 * count enqueued pour caller.
 */
export async function dispatchBroadcast(broadcast: {
  id: string;
  subject: string;
  body: string;
  segment: string;
  adminEmail: string;
}): Promise<{ enqueued: number; skipped: number; requested: number }> {
  const recipients = await resolveRecipients(broadcast.segment as BroadcastSegment);
  if (recipients.length === 0) {
    // Edge case : segment vidé entre schedule et execution. Mark SENT
    // quand même pour ne pas re-tenter en boucle. recipientCount = 0.
    await prisma.emailBroadcast.update({
      where: { id: broadcast.id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: 0 },
    });
    return { enqueued: 0, skipped: 0, requested: 0 };
  }

  const html = textToHtml(broadcast.body);

  // Audit-vérif H2 — IDEMPOTENCE PAR DESTINATAIRE. Le reaper du cron broadcasts
  // ré-arme (PROCESSING→SCHEDULED) un broadcast bloqué >15 min (process crashé /
  // timeout Lambda au milieu d'un gros envoi). Avant, dispatchBroadcast re-bouclait
  // alors sur TOUS les destinataires → ceux déjà servis recevaient un DOUBLON
  // (incident spam/CASL sur 10k envois). On préfetch les labels PAR-DESTINATAIRE
  // déjà enregistrés pour ce broadcast (1 requête, index label) et on saute ceux
  // qui ont déjà une livraison.
  const labelPrefix = `broadcast:${broadcast.id}:`;
  const sentLabels = new Set(
    (await prisma.emailDelivery.findMany({
      where: { label: { startsWith: labelPrefix } },
      select: { label: true },
    })).map((d) => d.label),
  );

  let enqueued = 0;
  let skipped = 0;

  for (const email of recipients) {
    const recipientLabel = `${labelPrefix}${email.toLowerCase()}`;
    // Déjà enqueued (run précédent après crash, OU doublon intra-segment) → skip.
    if (sentLabels.has(recipientLabel)) {
      skipped++;
      continue;
    }
    try {
      const unsubParams = new URLSearchParams({
        email,
        token: newsletterUnsubscribeToken(email),
      });
      const unsubscribeUrl = `${APP_URL}/newsletter/unsubscribe?${unsubParams.toString()}`;

      await sendAdminCustomMessageEmail({
        to: email,
        replyTo: broadcast.adminEmail,
        label: recipientLabel,
        marketing: true, // audit-vérif M3 — cap CASL + one-click List-Unsubscribe

        vars: {
          ORDER_ID: broadcast.id.slice(-6).toUpperCase(),
          SUBJECT: broadcast.subject,
          PREVIEW: broadcast.body.slice(0, 120).replace(/\n/g, ' '),
          BODY_HTML: html,
          ORDER_URL: `${APP_URL}/account`,
          SENDER_NAME: 'Équipe Plio',
          SENDER_EMAIL: broadcast.adminEmail,
          UNSUBSCRIBE_URL: unsubscribeUrl,
        },
      });
      sentLabels.add(recipientLabel); // garde contre un doublon intra-run
      enqueued++;
    } catch (err) {
      log.error({ err, email, broadcastId: broadcast.id }, 'broadcast email enqueue failed');
    }
  }

  await prisma.emailBroadcast.update({
    where: { id: broadcast.id },
    data: { status: 'SENT', sentAt: new Date(), recipientCount: enqueued },
  });

  return { enqueued, skipped, requested: recipients.length };
}
