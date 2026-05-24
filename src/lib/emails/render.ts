/**
 * Email template renderer.
 *
 * Templates HTML statiques dans src/lib/emails/templates/ avec placeholders
 * {{VAR}}. On les load au runtime via fs.readFileSync (cache JS) puis on
 * substitue les vars avant l'envoi via SES.
 *
 * Pour MVP : substitution simple par regex. À remplacer par un vrai engine
 * (Handlebars, MJML) si on a besoin de logique conditionnelle / loops.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { logEmail } from '@/lib/logger';

export type EmailTemplate =
  | 'magic-link'
  | 'welcome'
  | 'order-confirmation'
  | 'order-shipped'
  | 'order-delivered'
  | 'order-cancelled'
  | 'payment-failed'
  | 'refund-issued'
  | 'admin-daily-summary'
  | 'admin-custom-message'
  | 'reengagement-follow-up'
  | 'reengagement-winback'
  | 'abandoned-cart'
  | 'reseller-monthly-stats';

// Cache des templates chargés (au premier render)
const cache = new Map<EmailTemplate, string>();

function loadTemplate(name: EmailTemplate): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const path = join(process.cwd(), 'src/lib/emails/templates', `email-${name}.html`);
  const html = readFileSync(path, 'utf-8');
  cache.set(name, html);
  return html;
}

/**
 * Render a template with variables. Replaces {{VAR}} with values.
 * Missing vars become empty strings (safe default).
 */
export function renderEmail(
  template: EmailTemplate,
  vars: Record<string, string | number>,
): string {
  let html = loadTemplate(template);
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    html = html.replace(re, String(value));
  }
  // Clear any remaining {{VARS}} that weren't passed (avoid leaking template syntax)
  html = html.replace(/\{\{\s*\w+\s*\}\}/g, '');
  return html;
}

/**
 * Sujet par défaut pour chaque template. Override possible via `subject`
 * arg dans sendEmail() si tu veux du custom (ex: split-test).
 */
export const EMAIL_SUBJECTS: Record<EmailTemplate, (vars: Record<string, string | number>) => string> = {
  'magic-link': () => 'Ton lien de connexion Plio',
  'welcome': () => 'Bienvenue chez Plio · 3 trucs avant ta première commande',
  'order-confirmation': (v) => `C'est imprimé. Confirmation #${v.ORDER_ID ?? ''}`,
  'order-shipped': (v) => `Ta commande #${v.ORDER_ID ?? ''} est en route`,
  'order-delivered': (v) => `C'est arrivé. Merci #${v.ORDER_ID ?? ''}`,
  'order-cancelled': (v) => `Ta commande #${v.ORDER_ID ?? ''} a été annulée`,
  'payment-failed': (v) => `Ton paiement n'est pas passé · commande #${v.ORDER_ID ?? ''}`,
  'refund-issued': (v) => `Remboursement traité — ${v.AMOUNT ?? ''} $`,
  'admin-daily-summary': (v) => `Plio · ${v.ORDERS_24H ?? 0} commandes · ${v.REVENUE_24H ?? '0,00'} $ (${v.DATE_FORMATTED ?? ''})`,
  // Subject explicit — l'admin l'écrit lui-même, on prend tel quel
  'admin-custom-message': (v) => String(v.SUBJECT ?? `Plio · message sur ta commande #${v.ORDER_ID ?? ''}`),
  'reengagement-follow-up': (v) => `Comment c'était, ta commande #${v.ORDER_ID ?? ''} ?`,
  'reengagement-winback': () => `On t'a manqué ? Voici 10 % pour célébrer ton retour.`,
  'abandoned-cart': (v) => `Ta commande ${v.PRODUCT_NAME ?? 'Plio'} t'attend`,
  'reseller-monthly-stats': (v) => `Ton récap reseller — ${v.MONTH_LABEL ?? ''}`,
};

// ─── ACTUAL SEND (via SES SMTP) ───────────────────────────────────────────

const SES_CONFIGURED = !!process.env.SES_SMTP_USER;
const SES_HOST = process.env.SES_SMTP_HOST ?? 'email-smtp.ca-central-1.amazonaws.com';
const SES_FROM = process.env.SES_FROM ?? 'Plio <bonjour@plio.ca>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

export interface EmailAttachment {
  filename: string;
  /** Contenu binaire (Buffer ou Uint8Array). */
  content: Uint8Array;
  /** Content-Type (ex: 'application/pdf'). */
  contentType: string;
}

export async function sendEmail(opts: {
  to: string;
  template: EmailTemplate;
  vars: Record<string, string | number>;
  subject?: string;
  /** Reply-To header — pour que les replies aillent vers l'admin sender,
   *  pas vers bonjour@plio.ca (qui n'est pas monitoré). */
  replyTo?: string;
  /** Pièces jointes (PDF facture, etc.). */
  attachments?: EmailAttachment[];
  /** EmailDelivery.id pour le pixel d'open tracking. Si fourni, on inject
   *  un <img 1x1> pointant vers /api/emails/pixel/[id] juste avant </body>. */
  deliveryId?: string;
  /** Round 28 #4 — URL pour RFC 8058 one-click unsubscribe. Quand set,
   *  on ajoute List-Unsubscribe + List-Unsubscribe-Post: One-Click headers.
   *  Apple Mail / Gmail render un bouton "Unsubscribe" prominent à côté
   *  du From name. Use case : marketing emails (broadcasts, reseller stats,
   *  reengagement). NE PAS set pour transactional (orders, magic-link). */
  listUnsubscribeUrl?: string;
}) {
  let html = renderEmail(opts.template, opts.vars);
  const subject = opts.subject ?? EMAIL_SUBJECTS[opts.template](opts.vars);

  // Injecte le pixel de tracking si on a un deliveryId. Avant </body>
  // pour rester invisible (height=1 width=1, display:block pour pas
  // d'espace résiduel dans Outlook).
  if (opts.deliveryId) {
    const pixelUrl = `${APP_URL}/api/emails/pixel/${opts.deliveryId}`;
    const pixelTag = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${pixelTag}</body>`);
    } else {
      // Pas de </body> (template malformé) → append à la fin, mieux
      // que de ne pas tracker du tout.
      html = html + pixelTag;
    }
  }

  if (!SES_CONFIGURED) {
    // Dev mode : log au lieu d'envoyer
    logEmail.info(
      {
        to: opts.to,
        template: opts.template,
        subject,
        vars: opts.vars,
        replyTo: opts.replyTo,
        attachments: opts.attachments?.map((a) => ({ filename: a.filename, bytes: a.content.byteLength })),
        // Round 28 #4 — surface dans le log dev pour debugging
        listUnsubscribeUrl: opts.listUnsubscribeUrl,
      },
      'email (dev — not sent, SES not configured)',
    );
    return { sent: false, dev: true };
  }

  const { createTransport } = await import('nodemailer');
  const transport = createTransport({
    host: SES_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.SES_SMTP_USER!,
      pass: process.env.SES_SMTP_PASS!,
    },
  });

  // Round 28 #4 — RFC 8058 one-click unsubscribe headers pour marketing.
  // List-Unsubscribe = URL angle-bracketed.
  // List-Unsubscribe-Post = signal au client mail qu'on accepte POST sans
  // confirmation page. Combo requis pour le bouton Apple/Gmail.
  const extraHeaders = opts.listUnsubscribeUrl
    ? {
        'List-Unsubscribe': `<${opts.listUnsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }
    : undefined;

  await transport.sendMail({
    from: SES_FROM,
    to: opts.to,
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    subject,
    html,
    // text fallback : strip HTML tags
    text: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000),
    ...(extraHeaders ? { headers: extraHeaders } : {}),
    ...(opts.attachments && opts.attachments.length > 0
      ? {
          attachments: opts.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content),
            contentType: a.contentType,
          })),
        }
      : {}),
  });

  return { sent: true };
}
