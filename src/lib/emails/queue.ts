/**
 * Email queue avec retry exponential backoff.
 *
 * Refactor de l'ancien tryCatch best-effort qui swallowed les fails
 * silencieusement. Maintenant chaque email est :
 *   1. Persisté en DB (EmailDelivery row, status PENDING)
 *   2. Tenté immédiatement (sync, latence webhook acceptable)
 *   3. Sur succès → status SENT, sentAt = now
 *   4. Sur échec → status FAILED, nextAttemptAt scheduled selon backoff,
 *      attempts++
 *   5. Si attempts >= maxAttempts → status DEAD (manual intervention)
 *
 * Cron `/api/cron/email-retry` (toutes les 5 min) pick up les FAILED
 * où nextAttemptAt < now et re-tente.
 *
 * Backoff schedule (en minutes depuis création) :
 *   attempt 1 (initial) → fail → schedule retry à +5min
 *   attempt 2 (retry 1) → fail → schedule à +15min
 *   attempt 3 (retry 2) → fail → DEAD
 *
 * Total fenêtre de retry : ~20 min. Suffisant pour les hiccups SES
 * habituels (rare, mais arrive).
 */

import { prisma } from '@/lib/db';
import { sendEmail, type EmailTemplate } from './render';
import { logEmail } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

/**
 * Round 28 #4 — Templates marketing qui ont droit au RFC 8058 header.
 * NE PAS inclure les transactional (orders, magic-link, etc.) — ces
 * emails sont attendus et ne doivent JAMAIS proposer un unsubscribe global
 * (le user veut les confirmations de paiement même s'il a unsubscribé
 * de la newsletter).
 */
const MARKETING_TEMPLATES: ReadonlySet<EmailTemplate> = new Set([
  'admin-custom-message',
  'reengagement-follow-up',
  'reengagement-winback',
  'reseller-monthly-stats',
]);

/** Round 28 #4 — Derive l'unsubscribe URL pour un recipient.
 *  Idempotent + déterministe via HMAC, donc safe à re-derive en retry. */
function oneClickUnsubscribeUrl(to: string, template: EmailTemplate): string | undefined {
  if (!MARKETING_TEMPLATES.has(template)) return undefined;
  const email = to.toLowerCase().trim();
  const token = newsletterUnsubscribeToken(email);
  const params = new URLSearchParams({ email, token });
  return `${APP_URL}/api/newsletter/unsubscribe?${params.toString()}`;
}

export interface QueueEmailInput {
  to: string;
  template: EmailTemplate;
  vars: Record<string, string | number>;
  subject?: string;
  replyTo?: string;
  /** Label optionnel pour grouper (ex: orderId, 'daily-summary'). */
  label?: string;
  /** Override le default 3 attempts (rare). */
  maxAttempts?: number;
  /** Si set, processDelivery génère la facture PDF de cet order à la
   *  volée et l'attache à l'email. Idempotent → safe au retry. */
  attachOrderId?: string;
  /** Round 28 #4 — Marketing email → RFC 8058 one-click unsubscribe.
   *  Passé tel quel à sendEmail() qui ajoute les headers SMTP. */
  listUnsubscribeUrl?: string;
}

const BACKOFF_MINUTES = [5, 15]; // 1er retry +5min, 2e +15min

function nextRetryAt(attempts: number): Date | null {
  // attempts 1 = next +5min, attempts 2 = next +15min, attempts 3 = DEAD
  const minutesIdx = attempts - 1;
  const minutes = BACKOFF_MINUTES[minutesIdx];
  if (minutes === undefined) return null;
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Queue + tente immédiatement un email. Retourne { sent, id }.
 *
 * - sent=true : email parti vers SES avec succès
 * - sent=false : queued + retry programmé (cron va re-tenter)
 *
 * Ne throw JAMAIS — sécurise les webhook handlers contre les fails SES.
 */
export async function queueEmail(input: QueueEmailInput): Promise<{
  sent: boolean;
  id: string;
}> {
  // 1. Create EmailDelivery row PENDING
  let delivery;
  try {
    delivery = await prisma.emailDelivery.create({
      data: {
        to: input.to,
        template: input.template,
        varsJson: JSON.stringify(input.vars),
        subject: input.subject,
        replyTo: input.replyTo,
        label: input.label,
        attachOrderId: input.attachOrderId,
        maxAttempts: input.maxAttempts ?? 3,
        status: 'PENDING',
      },
    });
  } catch (err) {
    // Si on ne peut même pas INSERT, fallback à l'ancien comportement (best-effort)
    logEmail.error({ err, to: input.to, template: input.template }, 'queue insert failed, falling back to direct send');
    try {
      const attachments = await buildInvoiceAttachments(input.attachOrderId);
      await sendEmail({
        to: input.to,
        template: input.template,
        vars: input.vars,
        subject: input.subject,
        replyTo: input.replyTo,
        attachments,
        // Round 28 #4 — explicit override OR auto-derive from template
        listUnsubscribeUrl: input.listUnsubscribeUrl
          ?? oneClickUnsubscribeUrl(input.to, input.template),
      });
      return { sent: true, id: 'no-queue-fallback' };
    } catch {
      return { sent: false, id: 'no-queue-fallback' };
    }
  }

  // 2. Tente l'envoi immédiatement (inline)
  return processDelivery(delivery.id);
}

/**
 * Process une EmailDelivery par ID (initial OU retry).
 * Met à jour le status selon outcome.
 */
export async function processDelivery(deliveryId: string): Promise<{
  sent: boolean;
  id: string;
}> {
  // Round 17 #3 : claim atomique pour éviter qu'un cron N+1 réenvoie un
  // email que cron N est en train de traiter (cron run interval = 5min,
  // SES peut prendre > 5min sur attachment lourd). On update where
  // status IN ('PENDING', 'FAILED') → returns count. Si 0, un autre
  // run a déjà claimé — skip.
  const claim = await prisma.emailDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: ['PENDING', 'FAILED'] },
    },
    data: { status: 'PROCESSING' },
  });
  if (claim.count === 0) {
    // Soit SENT/DEAD/PROCESSING déjà → skip cleanly
    return { sent: false, id: deliveryId };
  }

  const delivery = await prisma.emailDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { sent: false, id: deliveryId };
  // Defense in depth : si le claim a marché mais que le delivery est
  // déjà SENT/DEAD (rare race en prod, test mocks loose), bail out cleanly.
  if (delivery.status === 'SENT') return { sent: true, id: deliveryId };
  if (delivery.status === 'DEAD') return { sent: false, id: deliveryId };

  const newAttempts = delivery.attempts + 1;
  const vars = JSON.parse(delivery.varsJson) as Record<string, string | number>;

  try {
    const attachments = await buildInvoiceAttachments(delivery.attachOrderId);
    await sendEmail({
      to: delivery.to,
      template: delivery.template as EmailTemplate,
      vars,
      subject: delivery.subject ?? undefined,
      replyTo: delivery.replyTo ?? undefined,
      attachments,
      // Pixel d'open tracking — pointe vers /api/emails/pixel/[id].
      // Quand le client mail charge l'image, on incrémente openCount +
      // set openedAt (1ère ouverture seulement).
      deliveryId,
      // Round 28 #4 — auto-derive on retry path (rebuilds from template +
      // to via HMAC token, déterministe et stateless)
      listUnsubscribeUrl: oneClickUnsubscribeUrl(delivery.to, delivery.template as EmailTemplate),
    });
    await prisma.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'SENT',
        attempts: newAttempts,
        sentAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
      },
    });
    return { sent: true, id: deliveryId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message.slice(0, 500) : 'unknown';
    const reachedMax = newAttempts >= delivery.maxAttempts;
    const next = reachedMax ? null : nextRetryAt(newAttempts);

    await prisma.emailDelivery.update({
      where: { id: deliveryId },
      data: {
        status: reachedMax ? 'DEAD' : 'FAILED',
        attempts: newAttempts,
        lastError: errMsg,
        nextAttemptAt: next,
      },
    });

    logEmail.error({
      err, deliveryId, template: delivery.template, to: delivery.to,
      attempts: newAttempts, reachedMax,
    }, reachedMax ? 'email DEAD after max retries' : 'email queued for retry');

    // Slack alert si DEAD — l'email est définitivement perdu, manual action requise
    if (reachedMax) {
      void sendCriticalAlert({
        severity: 'critical',
        title: `Email DEAD après ${delivery.maxAttempts} retries — ${delivery.template}`,
        body: `L'email ${delivery.template} à ${delivery.to} a échoué ${newAttempts}× et ne sera plus retenté. Investiguer SES ou contacter le client manuellement.`,
        context: {
          deliveryId,
          template: delivery.template,
          to: delivery.to,
          lastError: errMsg,
          label: delivery.label,
        },
      });
    }

    return { sent: false, id: deliveryId };
  }
}

/**
 * Génère les attachments à la volée à partir de l'attachOrderId stocké
 * sur l'EmailDelivery. Idempotent au retry : on régénère le même PDF
 * depuis l'order actuelle (donc même si l'order évolue, c'est cohérent
 * avec l'état au moment de l'envoi). Best-effort : si la génération
 * fail, on log et on send sans attachment plutôt que de bloquer l'email.
 */
async function buildInvoiceAttachments(
  orderId: string | null | undefined,
): Promise<import('./render').EmailAttachment[] | undefined> {
  if (!orderId) return undefined;
  try {
    const { generateInvoicePdf } = await import('@/lib/print/invoice-pdf');
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!order) {
      logEmail.warn({ orderId }, 'invoice attachment skipped : order not found');
      return undefined;
    }
    // Identité légale du vendeur — figure sur la facture pour CTI/RTI
    // côté clients B2B.
    const company = {
      legalName: process.env.COMPANY_LEGAL_NAME || 'Démocratik inc.',
      address: process.env.COMPANY_ADDRESS || 'Montréal QC, Canada',
      gst: process.env.COMPANY_GST_NUMBER || '(num. TPS à venir)',
      qst: process.env.COMPANY_QST_NUMBER || '(num. TVQ à venir)',
    };
    const bytes = await generateInvoicePdf({
      order,
      customer: { name: order.user.name, email: order.user.email },
      company,
    });
    const displayId = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();
    return [
      {
        filename: `facture-plio-${displayId}.pdf`,
        content: bytes,
        contentType: 'application/pdf',
      },
    ];
  } catch (err) {
    logEmail.error({ err, orderId }, 'invoice attachment generation failed — sending email without attachment');
    return undefined;
  }
}

/**
 * Récupère toutes les emails FAILED prêtes pour retry. Appelé par
 * /api/cron/email-retry toutes les 5 min.
 */
export async function getEmailsReadyForRetry(limit = 50) {
  // Round 17 #3 : on inclut maintenant PROCESSING dont updatedAt > 30min
  // (stuck — un cron run précédent a crashé après le claim atomique).
  // 30min est un cap large : SES + attachment PDF + retry intern devrait
  // jamais dépasser ça. Si un cron run < 30min essaie de re-claim,
  // l'updateMany dans processDelivery va return count=0 et skip.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
  return prisma.emailDelivery.findMany({
    where: {
      OR: [
        {
          status: 'FAILED',
          OR: [
            { nextAttemptAt: null },
            { nextAttemptAt: { lt: new Date() } },
          ],
        },
        {
          status: 'PROCESSING',
          updatedAt: { lt: thirtyMinAgo },
        },
      ],
    },
    select: { id: true },
    take: limit,
    orderBy: { createdAt: 'asc' },
  });
}
