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
  | 'refund-issued'
  | 'admin-daily-summary';

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
  'order-confirmation': (v) => `C'est imprimé. Confirmation #SIN-${v.ORDER_ID ?? ''}`,
  'order-shipped': (v) => `Ta commande #SIN-${v.ORDER_ID ?? ''} est en route`,
  'order-delivered': (v) => `C'est arrivé. Merci #SIN-${v.ORDER_ID ?? ''}`,
  'order-cancelled': (v) => `Ta commande #SIN-${v.ORDER_ID ?? ''} a été annulée`,
  'refund-issued': (v) => `Remboursement traité — ${v.AMOUNT ?? ''} $`,
  'admin-daily-summary': (v) => `Plio · ${v.ORDERS_24H ?? 0} commandes · ${v.REVENUE_24H ?? '0,00'} $ (${v.DATE_FORMATTED ?? ''})`,
};

// ─── ACTUAL SEND (via SES SMTP) ───────────────────────────────────────────

const SES_CONFIGURED = !!process.env.SES_SMTP_USER;
const SES_HOST = process.env.SES_SMTP_HOST ?? 'email-smtp.ca-central-1.amazonaws.com';
const SES_FROM = process.env.SES_FROM ?? 'Plio <bonjour@plio.ca>';

export async function sendEmail(opts: {
  to: string;
  template: EmailTemplate;
  vars: Record<string, string | number>;
  subject?: string;
}) {
  const html = renderEmail(opts.template, opts.vars);
  const subject = opts.subject ?? EMAIL_SUBJECTS[opts.template](opts.vars);

  if (!SES_CONFIGURED) {
    // Dev mode : log au lieu d'envoyer
    logEmail.info(
      { to: opts.to, template: opts.template, subject, vars: opts.vars },
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

  await transport.sendMail({
    from: SES_FROM,
    to: opts.to,
    subject,
    html,
    // text fallback : strip HTML tags
    text: html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 1000),
  });

  return { sent: true };
}
