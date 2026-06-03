/**
 * POST /api/webhooks/ses
 *
 * Round 39 #4. AWS SES → SNS → ce endpoint.
 *
 * Setup côté AWS :
 *   1. Crée une SNS topic (ex: plio-ses-feedback)
 *   2. Subscribe HTTPS endpoint : https://plio.ca/api/webhooks/ses
 *   3. Va dans SES → Configuration sets → Event destinations →
 *      crée une destination SNS qui publish sur ce topic pour
 *      Bounce + Complaint events
 *   4. La 1ère POST SNS sera un "SubscriptionConfirmation" — on appelle
 *      automatiquement le SubscribeURL pour le confirmer.
 *
 * Sécurité :
 *   - Vérification signature RSA (SignatureVersion 1 SHA-1 ou 2 SHA-256)
 *     contre le cert AWS officiel — empêche n'importe qui de POSTer du
 *     faux trafic pour déclencher des suppressions arbitraires.
 *   - Optionnel : SES_SNS_TOPIC_ARN env → vérifie que le TopicArn match
 *     (defense-in-depth si l'attaquant trouve un moyen de falsifier la
 *     signature, il faut aussi qu'il connaisse notre ARN exact).
 *
 * Logique :
 *   - Notification + Bounce permanent → suppress l'address
 *   - Notification + Complaint → suppress l'address
 *   - Notification + Bounce transient → log seulement (pas suppress —
 *     SES va retry quelques fois, puis donner un permanent si ça persiste)
 *   - SubscriptionConfirmation → fetch SubscribeURL pour confirm
 *   - UnsubscribeConfirmation → log (l'admin a supprimé manuellement
 *     la subscription côté SNS — pas grand-chose à faire)
 */

import { NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { recordWebhookEvent, updateWebhookOutcome } from '@/lib/db/orders';
import { verifySnsSignature, type SnsMessage } from '@/lib/webhooks/sns-verify';
import { suppressEmail } from '@/lib/emails/suppression';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Inner SES Message payload (Notification.Message est une string JSON serialisée). */
type SesBounceInner = {
  notificationType: 'Bounce';
  mail: { messageId: string; source?: string; destination?: string[] };
  bounce: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType?: string;
    bouncedRecipients: { emailAddress: string; status?: string; diagnosticCode?: string }[];
    timestamp?: string;
  };
};
type SesComplaintInner = {
  notificationType: 'Complaint';
  mail: { messageId: string; source?: string; destination?: string[] };
  complaint: {
    complainedRecipients: { emailAddress: string }[];
    complaintFeedbackType?: string;
    timestamp?: string;
  };
};

export async function POST(req: Request) {
  const start = Date.now();

  let rawBody: string;
  let msg: SnsMessage;
  try {
    rawBody = await req.text();
    msg = JSON.parse(rawBody) as SnsMessage;
  } catch (err) {
    log.error({ err }, 'ses webhook: invalid JSON');
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate minimal shape avant verify signature (verify lit ces fields).
  if (!msg.Type || !msg.MessageId || !msg.TopicArn || !msg.Signature || !msg.SigningCertURL) {
    log.error({ msgType: msg?.Type }, 'ses webhook: missing required SNS fields');
    return NextResponse.json({ error: 'Invalid SNS envelope' }, { status: 400 });
  }

  // Optional TopicArn allowlist (defense-in-depth). Read inside handler
  // (not at module top-level) pour permettre les tests d'override l'env
  // par cas, et pour permettre une rotation runtime sans restart.
  const expectedTopicArn = process.env.SES_SNS_TOPIC_ARN;
  if (expectedTopicArn && msg.TopicArn !== expectedTopicArn) {
    log.warn({ topicArn: msg.TopicArn, expected: expectedTopicArn }, 'ses webhook: unexpected TopicArn');
    return NextResponse.json({ error: 'Unexpected TopicArn' }, { status: 401 });
  }

  // Verify signature (skip en non-prod si OD_SKIP_SNS_VERIFY=1 pour faciliter tests manuels).
  if (process.env.NODE_ENV === 'production' || process.env.OD_SKIP_SNS_VERIFY !== '1') {
    try {
      await verifySnsSignature(msg);
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'ses webhook: signature verify failed');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  // Idempotence : dedup sur SNS MessageId (SNS livre at-least-once).
  // Audit v2 #2.3 — même fix que #2.2 : on ne déduplique que si une tentative
  // précédente a réussi. Si suppressEmail a throw au milieu d'une notif
  // multi-destinataires (success=false), le retry SNS doit pouvoir re-traiter.
  const dedup = await recordWebhookEvent({
    source: 'SES',
    eventId: msg.MessageId,
    eventType: msg.Type,
    payload: rawBody,
  });
  if (!dedup.isNew && dedup.alreadyCompleted) {
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    if (msg.Type === 'SubscriptionConfirmation') {
      // SNS demande qu'on GET le SubscribeURL pour confirmer la subscription.
      if (!msg.SubscribeURL) {
        log.error('ses webhook: SubscriptionConfirmation without SubscribeURL');
        await updateWebhookOutcome({
          source: 'SES',
          eventId: msg.MessageId,
          success: false,
          statusCode: 400,
          latencyMs: Date.now() - start,
          error: 'Missing SubscribeURL',
        });
        return NextResponse.json({ error: 'Missing SubscribeURL' }, { status: 400 });
      }
      const subRes = await fetch(msg.SubscribeURL);
      const ok = subRes.ok;
      log.info({ status: subRes.status, topicArn: msg.TopicArn }, 'ses webhook: subscription confirmed');
      await updateWebhookOutcome({
        source: 'SES',
        eventId: msg.MessageId,
        success: ok,
        statusCode: subRes.status,
        latencyMs: Date.now() - start,
      });
      return NextResponse.json({ received: true, subscribed: ok });
    }

    if (msg.Type === 'UnsubscribeConfirmation') {
      log.warn({ topicArn: msg.TopicArn }, 'ses webhook: SNS subscription removed (admin action)');
      await updateWebhookOutcome({
        source: 'SES',
        eventId: msg.MessageId,
        success: true,
        statusCode: 200,
        latencyMs: Date.now() - start,
      });
      return NextResponse.json({ received: true, unsubscribed: true });
    }

    if (msg.Type !== 'Notification') {
      log.warn({ type: msg.Type }, 'ses webhook: unknown SNS Type');
      await updateWebhookOutcome({
        source: 'SES',
        eventId: msg.MessageId,
        success: true,
        statusCode: 200,
        latencyMs: Date.now() - start,
      });
      return NextResponse.json({ received: true, ignored: true });
    }

    // Notification → parse l'inner SES payload (Message est une string JSON).
    let inner: SesBounceInner | SesComplaintInner;
    try {
      inner = JSON.parse(msg.Message) as SesBounceInner | SesComplaintInner;
    } catch (err) {
      log.error({ err }, 'ses webhook: inner Message JSON invalid');
      await updateWebhookOutcome({
        source: 'SES',
        eventId: msg.MessageId,
        success: false,
        statusCode: 400,
        latencyMs: Date.now() - start,
        error: 'Invalid inner JSON',
      });
      return NextResponse.json({ error: 'Invalid inner Message' }, { status: 400 });
    }

    if (inner.notificationType === 'Bounce') {
      const isPermanent = inner.bounce.bounceType === 'Permanent';
      const suppressed: string[] = [];
      for (const recip of inner.bounce.bouncedRecipients) {
        if (!isPermanent) {
          // Transient bounce : log seulement, ne pas suppress. SES retry,
          // si ça persiste, on recevra un Permanent → ce point suppress.
          log.warn({
            email: recip.emailAddress,
            subType: inner.bounce.bounceSubType,
            diag: recip.diagnosticCode,
          }, 'ses bounce (transient, not suppressing)');
          continue;
        }
        await suppressEmail({
          email: recip.emailAddress,
          reason: 'HARD_BOUNCE',
          source: 'SES_BOUNCE',
          sesMessageId: inner.mail.messageId,
          details: JSON.stringify({
            bounceType: inner.bounce.bounceType,
            bounceSubType: inner.bounce.bounceSubType,
            diagnosticCode: recip.diagnosticCode,
            status: recip.status,
          }),
        });
        suppressed.push(recip.emailAddress);
      }
      await updateWebhookOutcome({
        source: 'SES',
        eventId: msg.MessageId,
        success: true,
        statusCode: 200,
        latencyMs: Date.now() - start,
      });
      log.info({ count: suppressed.length, isPermanent, bounceSubType: inner.bounce.bounceSubType }, 'ses bounce processed');
      return NextResponse.json({ received: true, suppressed: suppressed.length, permanent: isPermanent });
    }

    if (inner.notificationType === 'Complaint') {
      const suppressed: string[] = [];
      for (const recip of inner.complaint.complainedRecipients) {
        await suppressEmail({
          email: recip.emailAddress,
          reason: 'COMPLAINT',
          source: 'SES_COMPLAINT',
          sesMessageId: inner.mail.messageId,
          details: JSON.stringify({
            complaintFeedbackType: inner.complaint.complaintFeedbackType,
          }),
        });
        suppressed.push(recip.emailAddress);
      }
      await updateWebhookOutcome({
        source: 'SES',
        eventId: msg.MessageId,
        success: true,
        statusCode: 200,
        latencyMs: Date.now() - start,
      });
      log.warn({ count: suppressed.length, fbType: inner.complaint.complaintFeedbackType }, 'ses complaint processed (URGENT signal)');
      return NextResponse.json({ received: true, suppressed: suppressed.length, kind: 'complaint' });
    }

    // Inner Type non Bounce/Complaint (ex: Delivery, DeliveryDelay) — ignore proprement.
    log.info({ innerType: (inner as { notificationType?: string }).notificationType }, 'ses webhook: ignored inner notification type');
    await updateWebhookOutcome({
      source: 'SES',
      eventId: msg.MessageId,
      success: true,
      statusCode: 200,
      latencyMs: Date.now() - start,
    });
    return NextResponse.json({ received: true, ignored: true });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown';
    log.error({ err }, 'ses webhook: handler failed');
    await updateWebhookOutcome({
      source: 'SES',
      eventId: msg.MessageId,
      success: false,
      statusCode: 500,
      latencyMs: Date.now() - start,
      error: errMsg,
    });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
