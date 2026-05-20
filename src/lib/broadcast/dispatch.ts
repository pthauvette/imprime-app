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
}): Promise<{ enqueued: number; requested: number }> {
  const recipients = await resolveRecipients(broadcast.segment as BroadcastSegment);
  if (recipients.length === 0) {
    // Edge case : segment vidé entre schedule et execution. Mark SENT
    // quand même pour ne pas re-tenter en boucle. recipientCount = 0.
    await prisma.emailBroadcast.update({
      where: { id: broadcast.id },
      data: { status: 'SENT', sentAt: new Date(), recipientCount: 0 },
    });
    return { enqueued: 0, requested: 0 };
  }

  const html = textToHtml(broadcast.body);
  let enqueued = 0;

  for (const email of recipients) {
    try {
      const unsubParams = new URLSearchParams({
        email,
        token: newsletterUnsubscribeToken(email),
      });
      const unsubscribeUrl = `${APP_URL}/newsletter/unsubscribe?${unsubParams.toString()}`;

      await sendAdminCustomMessageEmail({
        to: email,
        replyTo: broadcast.adminEmail,
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
      enqueued++;
    } catch (err) {
      log.error({ err, email, broadcastId: broadcast.id }, 'broadcast email enqueue failed');
    }
  }

  await prisma.emailBroadcast.update({
    where: { id: broadcast.id },
    data: { status: 'SENT', sentAt: new Date(), recipientCount: enqueued },
  });

  return { enqueued, requested: recipients.length };
}
