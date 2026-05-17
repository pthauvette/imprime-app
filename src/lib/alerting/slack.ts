/**
 * Slack alerting pour les failures critiques en prod.
 *
 * Sentry catch les errors silencieusement — utile pour debug post-mortem.
 * Slack alerts = bipper réel sur ton téléphone pour les trucs qui ont un
 * impact $$ immédiat (refund failed, webhook handler down, etc.).
 *
 * Usage :
 *   await sendCriticalAlert({
 *     severity: 'critical',
 *     title: 'Refund failed after Sinalite failure',
 *     body: 'Order ord_xyz · PI pi_xyz · need manual intervention',
 *     context: { orderId, intentId, error }
 *   });
 *
 * Setup :
 *   1. Slack → workspace → Apps → "Incoming Webhooks" → Add
 *   2. Choose channel (ex: #plio-alerts)
 *   3. Copy webhook URL
 *   4. Set SLACK_WEBHOOK_URL env var dans Amplify
 *
 * Si SLACK_WEBHOOK_URL absent → noop (dev / staging sans channel).
 * Best-effort : ne throw JAMAIS, ne bloque jamais le code calling.
 */

import { log } from '@/lib/logger';

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
const ENV_LABEL = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface CriticalAlertInput {
  /** critical = bipper ton phone. warning = check dans 1h. info = noté */
  severity: AlertSeverity;
  /** Court titre humain (1 ligne, < 100 chars). */
  title: string;
  /** Description plus longue, multi-lines OK. Affiché en monospace. */
  body: string;
  /** Contexte structuré (orderId, intentId, etc.) — sera formaté en code block JSON. */
  context?: Record<string, unknown>;
  /** Lien optionnel vers une page admin pour debug rapide. */
  actionUrl?: string;
  actionLabel?: string;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: '#B83A2C', // rouge
  warning: '#D97706', // orange
  info: '#1F3D2B', // vert Plio
};

/**
 * Envoie une alerte Slack. Best-effort : ne throw jamais.
 *
 * @returns true si envoyé, false si skip (no webhook) ou si fail.
 */
export async function sendCriticalAlert(input: CriticalAlertInput): Promise<boolean> {
  // Toujours logger localement même si Slack down/absent — c'est le canal
  // primary pour Sentry/CloudWatch.
  const logLevel = input.severity === 'critical' ? 'fatal' : input.severity === 'warning' ? 'warn' : 'info';
  log[logLevel === 'fatal' ? 'fatal' : logLevel]({ alert: input }, `ALERT: ${input.title}`);

  if (!SLACK_WEBHOOK_URL) {
    return false;
  }

  // Skip alerts en dev pour pas spammer le channel pendant les tests locaux.
  // Override avec SLACK_ALERTS_IN_DEV=1 si besoin.
  if (ENV_LABEL === 'dev' && process.env.SLACK_ALERTS_IN_DEV !== '1') {
    return false;
  }

  try {
    const payload = buildSlackPayload(input);
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Timeout court — on n'attend pas plus de 3s pour Slack.
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      log.error({ status: res.status, statusText: res.statusText }, 'Slack webhook returned non-OK');
      return false;
    }
    return true;
  } catch (err) {
    // Network error, timeout, etc. — on log mais on ne propage pas.
    log.error({ err }, 'Slack alert send failed');
    return false;
  }
}

function buildSlackPayload(input: CriticalAlertInput): Record<string, unknown> {
  const emoji = SEVERITY_EMOJI[input.severity];
  const color = SEVERITY_COLOR[input.severity];
  const envBadge = ENV_LABEL === 'prod' ? '' : ` _[${ENV_LABEL}]_`;

  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${input.title}`.slice(0, 150),
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${envBadge}\n${input.body}`,
      },
    },
  ];

  if (input.context && Object.keys(input.context).length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '```\n' + JSON.stringify(input.context, null, 2).slice(0, 2900) + '\n```',
      },
    });
  }

  if (input.actionUrl) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: input.actionLabel ?? 'Ouvrir →' },
          url: input.actionUrl.startsWith('http') ? input.actionUrl : `${APP_URL}${input.actionUrl}`,
          style: input.severity === 'critical' ? 'danger' : 'primary',
        },
      ],
    });
  }

  return {
    // Fallback text pour les notifications mobiles + clients qui ne render
    // pas les blocks.
    text: `${emoji} ${input.title}`,
    attachments: [{ color, blocks }],
  };
}
