/**
 * Type-safe email send helpers — un par template transactionnel.
 *
 * Format des nombres / dates conforme fr-CA (séparateur virgule pour décimales,
 * formats de date en français).
 *
 * Chaque helper :
 *   1. Build les vars typées depuis un Order DB + payload contextuel
 *   2. Appelle sendEmail() qui rend le template HTML + envoie via SES
 *   3. Catch les erreurs SES sans throw (l'email est best-effort, ne doit pas
 *      bloquer la transition d'état)
 */

import type { Order, User } from '@prisma/client';
import { queueEmail } from './queue';
import { logEmail } from '@/lib/logger';
import { parseItemsSnapshot, type DisplayItem } from '@/lib/orders/items';
import { renderLifecycleTimeline } from './lifecycle-timeline';
import type {
  OrderConfirmationVars,
  OrderShippedVars,
  OrderDeliveredVars,
  OrderCancelledVars,
  PaymentFailedVars,
  RefundIssuedVars,
  WelcomeVars,
  AdminDailySummaryVars,
  AdminCustomMessageVars,
  ReengagementFollowUpVars,
  ReengagementWinbackVars,
  AbandonedCartVars,
  ResellerMonthlyStatsVars,
} from './vars';

// ─── FORMATTERS ───────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

// Identité légale du vendeur — figure sur tous les reçus pour permettre
// au client B2B de réclamer ses CTI (crédits taxe intrant fédéraux) +
// RTI (remboursements taxe intrant Québec).
// Fallback à des placeholders en dev pour pas crasher si env absent —
// les vraies valeurs sont set dans Amplify env vars.
// `||` (pas `??`) parce qu'env vars vides sont fréquentes en dev/CI et
// doivent fall back aux placeholders, pas afficher une string vide.
const COMPANY = {
  legalName: process.env.COMPANY_LEGAL_NAME || 'Démocratik inc.',
  address: process.env.COMPANY_ADDRESS || 'Montréal QC, Canada',
  gst: process.env.COMPANY_GST_NUMBER || '(num. TPS à venir)',
  qst: process.env.COMPANY_QST_NUMBER || '(num. TVQ à venir)',
};

const cad = (cents: number) =>
  (cents / 100).toFixed(2).replace('.', ',');

const dateFr = (d: Date) =>
  d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });

const dateFrLong = (d: Date) =>
  d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });

const timeFr = (d: Date) =>
  d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false });

const firstName = (user: { firstName: string | null; name: string | null; email: string }) =>
  user.firstName ?? user.name?.split(' ')[0] ?? user.email.split('@')[0];

const fullName = (user: { firstName: string | null; lastName: string | null; name: string | null; email: string }) =>
  user.name ?? ([user.firstName, user.lastName].filter(Boolean).join(' ') || user.email);

function shipAddressHtml(order: Order): string {
  const line2 = order.shipLine2 ? `<br>${escape(order.shipLine2)}` : '';
  return `${escape(order.shipName)}<br>${escape(order.shipLine1)}${line2}<br>${escape(order.shipCity)}, ${escape(order.shipProvince)} ${escape(order.shipPostalCode)}<br>${escape(order.shipPhone)}`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function orderUrl(order: Order): string {
  return `${APP_URL}/orders/${order.id}`;
}

/**
 * URL publique de suivi (sans login required) pour les guests + customer
 * qui n'ont pas le réflexe de signin.
 *
 * Round 24 #5 — privacy fix : on ne met PLUS l'email en query string.
 * Avant : `/track?orderId=X&email=Y` → leak email PII dans access logs
 * serveur + referrer headers vers domaines externes si l'email client
 * suit le lien et que le user clique ensuite vers ailleurs.
 *
 * Le param `orderId` n'est pas PII en soi — il est déjà dans le sujet
 * et le corps du courriel. La TrackingForm le lit via useSearchParams
 * pour pré-remplir le numéro de commande. L'email reste à taper
 * manuellement (preuve de propriété légère).
 */
function trackUrl(order: Order, _user: { email: string }): string {
  const orderRef = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();
  const params = new URLSearchParams({ orderId: orderRef });
  return `${APP_URL}/track?${params.toString()}`;
}

function unsubscribeUrl(): string {
  return `${APP_URL}/settings/email-preferences`;
}

/**
 * Render le récapitulatif itemized en HTML inline-styled (compat Gmail/Outlook
 * — pas de CSS class, tout en style="..."). Un bloc par item du snapshot,
 * fallback à un bloc unique productSummary + itemsCount si pas de snapshot.
 *
 * Le format chips est repris du template original (background #E5EDE8,
 * border-radius pill, font monospace) pour rester cohérent visuellement.
 */
function itemsHtmlBlock(order: Order): string {
  const items = parseItemsSnapshot(order.itemsSnapshot);

  function chip(label: string): string {
    return `<span style="display:inline-block; margin-right:6px; margin-bottom:4px; padding:4px 10px; background:#E5EDE8; color:#1F3D2B; border-radius:9999px; font-size:11px; font-family:ui-monospace,'SF Mono',Menlo,monospace; letter-spacing:0.04em; text-transform:uppercase; font-weight:600;">${escape(label)}</span>`;
  }

  function renderItem(item: DisplayItem, idx: number, total: number): string {
    const chips: string[] = [];
    for (const opt of item.options) chips.push(opt.label);
    if (item.qtyLabel) chips.push(`${item.qtyLabel} unités`);
    if (item.turnaround) chips.push(item.turnaround);
    const numPrefix = total > 1 ? `<span style="display:inline-block; margin-right:8px; padding:2px 8px; background:#1F3D2B; color:#FFFFFF; border-radius:4px; font-size:10px; font-family:ui-monospace,'SF Mono',Menlo,monospace; font-weight:600;">${String(idx + 1).padStart(2, '0')}</span>` : '';
    return `
      <div style="padding:14px 0; ${idx < total - 1 ? 'border-bottom:1px solid #ECEAE3;' : ''}">
        <p style="margin:0 0 6px 0; font-size:15px; font-weight:600; color:#141C16;">
          ${numPrefix}${escape(item.productName)}
        </p>
        <div>${chips.map(chip).join('')}</div>
      </div>
    `.trim();
  }

  if (items && items.length > 0) {
    return items.map((it, i) => renderItem(it, i, items.length)).join('');
  }

  // Fallback : vieille order sans snapshot — un seul bloc avec
  // productSummary et le total d'items count.
  const summary = order.productSummary ?? 'Ta commande Plio';
  return `
    <div style="padding:14px 0;">
      <p style="margin:0 0 6px 0; font-size:15px; font-weight:600; color:#141C16;">
        ${escape(summary)}
      </p>
      <div>${chip(`${order.itemsCount} article${order.itemsCount > 1 ? 's' : ''}`)}</div>
    </div>
  `.trim();
}

// ─── SEND HELPERS ─────────────────────────────────────────────────────────

/**
 * Envoyé sur le premier sign-in d'un nouveau user.
 * Triggered par events.signIn() dans auth.ts avec garde "isNewUser" + DB
 * column welcomeEmailSentAt pour éviter les doublons.
 */
export async function sendWelcomeEmail(input: { user: User }) {
  const { user } = input;
  const vars: WelcomeVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    TEMPLATES_URL: `${APP_URL}/templates`,
    ORDER_START_URL: `${APP_URL}/order/start`,
    CATALOG_URL: `${APP_URL}/templates`,
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'welcome',
    vars: vars as unknown as Record<string, string | number>,
    label: `welcome:${user.id}`,
  });
}

/** Envoyé après payment_intent.succeeded + submission Sinalite réussie. */
export async function sendOrderConfirmationEmail(input: {
  order: Order;
  user: User;
}) {
  const { order, user } = input;
  const vars: OrderConfirmationVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    CUSTOMER_NAME: fullName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    QUANTITY: order.itemsCount,
    PRODUCT_NAME: order.productSummary ?? 'Ta commande Plio',
    ITEMS_HTML: itemsHtmlBlock(order),
    SUBTOTAL: cad(order.subtotalCents),
    SHIPPING: cad(order.shippingCents),
    TAX: cad(order.taxCents),
    TOTAL: cad(order.amountCents),
    SHIPPING_METHOD: order.shippingMethod,
    SHIP_CITY: order.shipCity,
    SHIP_ADDRESS_HTML: shipAddressHtml(order),
    // Lien /track : public (pas de login required), pré-rempli orderId + email
    // → optimal pour les guests qui veulent voir status en 1 click depuis l'email.
    TRACK_ORDER_URL: trackUrl(order, user),
    UNSUBSCRIBE_URL: unsubscribeUrl(),
    // Bloc reçu légal — populé depuis env vars Amplify
    COMPANY_LEGAL_NAME: COMPANY.legalName,
    COMPANY_ADDRESS: COMPANY.address,
    COMPANY_GST_NUMBER: COMPANY.gst,
    COMPANY_QST_NUMBER: COMPANY.qst,
  };
  return queueEmail({
    to: user.email,
    template: 'order-confirmation',
    vars: vars as unknown as Record<string, string | number>,
    label: `order-confirmation:${order.id}`,
    // Auto-attach la facture PDF (TPS/TVQ + identité vendeur) — les clients
    // B2B la veulent direct dans leur boîte de réception pour leur compta,
    // sans avoir à cliquer "Télécharger" sur le portail. Best-effort : si
    // la génération PDF fail, l'email part quand même sans attachment.
    attachOrderId: order.id,
  });
}

/** Envoyé sur webhook Sinalite status=SHIPPED. Skip si user opt-out. */
export async function sendOrderShippedEmail(input: {
  order: Order;
  user: User;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: Date;
}) {
  const { order, user } = input;
  if (!user.emailDeliveryNotifications) {
    logEmail.info({ userId: user.id, kind: 'shipped' }, 'skipping notification — user opted out');
    return { sent: false, optedOut: true };
  }
  const eta = input.estimatedDelivery ?? new Date(Date.now() + 2 * 24 * 3600 * 1000);
  const carrier = input.carrier ?? extractCarrier(order.shippingMethod);
  const tracking = input.trackingNumber ?? '';
  const vars: OrderShippedVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    CUSTOMER_NAME: fullName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    CARRIER: carrier,
    CARRIER_SERVICE: extractService(order.shippingMethod, carrier),
    TRACKING_NUMBER: tracking,
    TRACK_URL: trackingDeepLink(carrier, tracking),
    ETA_FORMATTED: dateFrLong(eta),
    SHIP_ADDRESS_HTML: shipAddressHtml(order),
    ORDER_URL: orderUrl(order),
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'order-shipped',
    vars: vars as unknown as Record<string, string | number>,
    label: `order-shipped:${order.id}`,
  });
}

/** Envoyé sur webhook Sinalite status=DELIVERED. Skip si user opt-out. */
export async function sendOrderDeliveredEmail(input: {
  order: Order;
  user: User;
  deliveredAt?: Date;
}) {
  const { order, user } = input;
  if (!user.emailDeliveryNotifications) {
    logEmail.info({ userId: user.id, kind: 'delivered' }, 'skipping notification — user opted out');
    return { sent: false, optedOut: true };
  }
  const deliveredAt = input.deliveredAt ?? new Date();
  const vars: OrderDeliveredVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    CUSTOMER_NAME: fullName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    DELIVERED_AT_FORMATTED: `${timeFr(deliveredAt)} le ${dateFr(deliveredAt)}`,
    QUANTITY: order.itemsCount,
    PRODUCT_NAME: order.productSummary ?? 'Ta commande Plio',
    TOTAL: cad(order.amountCents),
    REORDER_URL: `${APP_URL}/order/start?reorder=${order.id}`,
    FEEDBACK_URL: `${APP_URL}/orders/${order.id}?feedback=true`,
    // Mini-timeline 4 étapes — toutes done à ce stade (livraison = closure
    // visuelle satisfaisante du workflow customer).
    LIFECYCLE_TIMELINE_HTML: renderLifecycleTimeline(4),
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'order-delivered',
    vars: vars as unknown as Record<string, string | number>,
    label: `order-delivered:${order.id}`,
  });
}

/**
 * Envoyé quand l'order est annulée — soit manuel admin, soit auto-refund
 * Stripe parce que Sinalite a refusé la commande.
 */
export async function sendOrderCancelledEmail(input: {
  order: Order;
  user: User;
  reason: string;
  refundAmountCents?: number;
  cardLast4?: string;
  apologyPromoCode?: string;
}) {
  const { order, user } = input;
  const refundCents = input.refundAmountCents ?? order.amountCents;
  const vars: OrderCancelledVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    CUSTOMER_NAME: fullName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    REFUND_AMOUNT: cad(refundCents),
    CANCEL_REASON: input.reason,
    CARD_LAST4_DISPLAY: input.cardLast4 ? `•••• ${input.cardLast4}` : 'ta carte de paiement',
    APOLOGY_PROMO_CODE: input.apologyPromoCode ?? 'DÉSOLÉ20',
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'order-cancelled',
    vars: vars as unknown as Record<string, string | number>,
    label: `order-cancelled:${order.id}`,
  });
}

/**
 * Envoyé quand un payment_intent.payment_failed arrive du webhook Stripe.
 *
 * Pas d'opt-out check : c'est transactionnel — le user veut SAVOIR que sa
 * commande n'est pas passée. Sinon il imagine qu'elle est en production
 * et appelle le support 3 jours plus tard.
 *
 * Le `failureReason` est passé tel quel (déjà friendly via Stripe). Le
 * `retryUrl` pointe vers /order/start par défaut — pas de tentative de
 * resume avec un PaymentIntent fresh (trop complexe pour MVP).
 */
export async function sendPaymentFailedEmail(input: {
  order: Order;
  user: User;
  failureReason: string;
  retryUrl?: string;
}) {
  const { order, user, failureReason } = input;
  const vars: PaymentFailedVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    FAILURE_REASON: failureReason,
    RETRY_URL: input.retryUrl ?? `${APP_URL}/order/start`,
  };
  return queueEmail({
    to: user.email,
    template: 'payment-failed',
    vars: vars as unknown as Record<string, string | number>,
    label: `payment-failed:${order.id}`,
  });
}

/**
 * Message custom écrit par admin pour un customer. Body est du texte brut
 * fourni par admin — on l'escape + on le split en <p> dans le caller pour
 * éviter qu'un admin distrait paste du HTML qui casserait l'email.
 *
 * Reply-To set sur sender email pour que le customer puisse répondre direct
 * à l'admin (pas à bonjour@plio.ca générique).
 */
export async function sendAdminCustomMessageEmail(input: {
  to: string;
  vars: AdminCustomMessageVars;
  /** Reply-To header — typiquement l'email de l'admin envoyeur. */
  replyTo: string;
}) {
  return queueEmail({
    to: input.to,
    template: 'admin-custom-message',
    vars: input.vars as unknown as Record<string, string | number>,
    subject: input.vars.SUBJECT,
    replyTo: input.replyTo,
    label: `admin-custom-message:${input.vars.ORDER_ID}`,
  });
}

/**
 * Récap quotidien envoyé chaque matin à l'admin (tous les ADMIN_EMAILS).
 * Toutes les vars sont pré-calculées par le caller — ce helper fait juste
 * l'envoi typé. À schedule via /api/cron/daily-summary + GH Actions.
 */
export async function sendAdminDailySummaryEmail(input: {
  to: string;
  vars: AdminDailySummaryVars;
}) {
  return queueEmail({
    to: input.to,
    template: 'admin-daily-summary',
    vars: input.vars as unknown as Record<string, string | number>,
    label: `admin-daily-summary:${new Date().toISOString().slice(0, 10)}`,
  });
}

/**
 * Re-engagement #1 : post-delivery follow-up envoyé 7 jours après
 * webhook Sinalite DELIVERED. Demande un avis + propose reorder en 1 click.
 * Label déterministe pour dedup : `reengagement-follow-up:<orderId>`.
 */
export async function sendReengagementFollowUpEmail(input: {
  order: Order;
  user: User;
  reviewUrl: string;
}) {
  const { order, user } = input;
  // Round 13 #1 : check le flag granulaire emailReengagement (pas le legacy
  // emailDeliveryNotifications qui ne couvre que les ship/delivered).
  if (!user.emailReengagement) {
    logEmail.info({ userId: user.id, kind: 'reengagement-follow-up' }, 'skipping — user opted out');
    return { sent: false, optedOut: true };
  }
  const vars: ReengagementFollowUpVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    PRODUCT_SUMMARY: order.productSummary ?? 'ta commande',
    REVIEW_URL: input.reviewUrl,
    REORDER_URL: `${APP_URL}/order/start?reorder=${order.id}`,
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'reengagement-follow-up',
    vars: vars as unknown as Record<string, string | number>,
    label: `reengagement-follow-up:${order.id}`,
  });
}

/**
 * Re-engagement #2 : win-back envoyé à un user dont la dernière commande
 * payée a > 90 jours. Inclut un code promo (déjà créé dans DB par le caller).
 * Label déterministe : `reengagement-winback:<userId>:<year>-<month>` pour
 * éviter d'en envoyer plus d'1 par mois calendaire.
 */
export async function sendReengagementWinbackEmail(input: {
  user: User;
  promoCode: string;
  discountLabel: string;
  daysSinceLast: number;
}) {
  const { user } = input;
  // Round 13 #1 : flag granulaire (winback campaigns)
  if (!user.emailReengagement) {
    logEmail.info({ userId: user.id, kind: 'reengagement-winback' }, 'skipping — user opted out');
    return { sent: false, optedOut: true };
  }
  const now = new Date();
  const labelMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const vars: ReengagementWinbackVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    PROMO_CODE: input.promoCode,
    DISCOUNT_LABEL: input.discountLabel,
    DAYS_SINCE_LAST: input.daysSinceLast,
    ORDER_START_URL: `${APP_URL}/order/start`,
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'reengagement-winback',
    vars: vars as unknown as Record<string, string | number>,
    label: `reengagement-winback:${user.id}:${labelMonth}`,
  });
}

/**
 * Envoyé par cron/abandoned-cart 24h+ après un cart en standby (user a
 * atteint /order/shipping mais n'a pas finalisé). 1x par cart via le
 * dedup AbandonedCart.emailSentAt côté caller.
 *
 * Pas d'opt-out check : le user a démontré son intent en saisissant
 * email + shipping — un recovery est légitime. Mais on inclut le lien
 * unsub par CASL compliance.
 */
export async function sendAbandonedCartEmail(input: {
  to: string;
  firstName: string;
  productName: string;
  resumeUrl: string;
  cartId: string;
}) {
  const vars: AbandonedCartVars = {
    CUSTOMER_FIRST_NAME: input.firstName,
    PRODUCT_NAME: input.productName,
    RESUME_URL: input.resumeUrl,
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: input.to,
    template: 'abandoned-cart',
    vars: vars as unknown as Record<string, string | number>,
    label: `abandoned-cart:${input.cartId}`,
  });
}

/** Envoyé séparément quand un refund est traité (peut être partial). */
export async function sendRefundIssuedEmail(input: {
  order: Order;
  user: User;
  refundAmountCents: number;
  reason: string;
  cardLast4?: string;
  refundDate?: Date;
}) {
  const { order, user } = input;
  const refundDate = input.refundDate ?? new Date();
  const vars: RefundIssuedVars = {
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    AMOUNT: cad(input.refundAmountCents),
    REFUND_DATE_FORMATTED: dateFr(refundDate),
    CARD_LAST4_DISPLAY: input.cardLast4 ? `Visa •••• ${input.cardLast4}` : 'ta carte de paiement',
    REFUND_REASON: input.reason,
    ORDER_URL: orderUrl(order),
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return queueEmail({
    to: user.email,
    template: 'refund-issued',
    vars: vars as unknown as Record<string, string | number>,
    label: `refund-issued:${order.id}`,
  });
}

/**
 * Demande de review post-livraison. Auto-déclenché par le webhook
 * Sinalite DELIVERED (après sendOrderDeliveredEmail, donc 2 emails
 * arrivent rapprochés — acceptable pour MVP, smarter scheduling
 * possible plus tard via EmailDelivery.scheduledFor).
 *
 * Reuse le template admin-custom-message pour pas créer un nouveau
 * template à maintenir. Link vers /reviews/submit?orderId=X&token=Y
 * où l'user peut laisser ses étoiles + commentaire.
 */
export async function sendReviewRequestEmail(input: {
  order: Order;
  user: User;
}) {
  const { order, user } = input;
  // Skip si user a opt-out des delivery notifications (review = bonus marketing)
  if (!user.emailDeliveryNotifications) {
    logEmail.info({ userId: user.id, kind: 'review-request' }, 'skipping notification — user opted out');
    return { sent: false, id: 'opted-out' };
  }

  // Import lazy pour éviter cycle deps potentiel (reviews/token ne dépend
  // pas de send.ts donc strict pas nécessaire, mais consistent pattern)
  const { reviewSubmitToken } = await import('@/lib/reviews/token');
  const token = reviewSubmitToken(order.id);
  const reviewUrl = `${APP_URL}/reviews/submit?orderId=${order.id}&token=${token}`;
  const customerName = firstName(user);
  const displayOrderId = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();

  const body =
    `Salut ${customerName} !\n\n` +
    `Ta commande #${displayOrderId} est livrée — on espère que tout est nickel.\n\n` +
    `Tu prends 30 secondes pour nous laisser une note ? Ça aide énormément les prochains clients qui hésitent à essayer Plio.\n\n` +
    `${reviewUrl}\n\n` +
    `Merci !\nL'équipe Plio`;

  return queueEmail({
    to: user.email,
    template: 'admin-custom-message',
    vars: {
      ORDER_ID: displayOrderId,
      SUBJECT: `Une étoile pour ta commande #${displayOrderId} ?`,
      PREVIEW: `30 secondes pour laisser une note sur ta commande Plio livrée`,
      BODY_HTML: body
        .split(/\n\n+/)
        .map((p) => `<p style="margin:0 0 14px;">${escape(p.trim()).replace(/\n/g, '<br>')}</p>`)
        .join('\n'),
      ORDER_URL: reviewUrl,
      SENDER_NAME: 'L\'équipe Plio',
      SENDER_EMAIL: 'bonjour@plio.ca',
    } as unknown as Record<string, string | number>,
    subject: `Une étoile pour ta commande #${displayOrderId} ?`,
    label: `review-request:${order.id}`,
  });
}

/**
 * Round 24 #4 — Récap mensuel reseller. Envoyé le 1er du mois aux users
 * VERIFIED ou AUTO_DETECTED qui ont au moins 1 order le mois écoulé.
 *
 * Gated par emailMarketing (c'est un récap, pas un transactional).
 *
 * Label : `reseller-monthly-stats:<userId>:<YYYY-MM>` → idempotent au re-run.
 */
export async function sendResellerMonthlyStatsEmail(input: {
  user: User;
  vars: ResellerMonthlyStatsVars;
  /** ex: '2026-04', utilisé pour le dedup label. */
  monthKey: string;
}) {
  const { user } = input;
  // Marketing flag : c'est un récap périodique, pas transactional.
  if (!user.emailMarketing) {
    logEmail.info(
      { userId: user.id, kind: 'reseller-monthly-stats' },
      'skipping — user opted out of marketing emails',
    );
    return { sent: false, optedOut: true };
  }
  return queueEmail({
    to: user.email,
    template: 'reseller-monthly-stats',
    vars: input.vars as unknown as Record<string, string | number>,
    subject: `Ton récap reseller — ${input.vars.MONTH_LABEL}`,
    label: `reseller-monthly-stats:${user.id}:${input.monthKey}`,
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
// (tryCatch best-effort retiré — remplacé par queueEmail qui persiste +
// schedule des retries automatiques via /api/cron/email-retry.)

function extractCarrier(shippingMethod: string): string {
  // Sinalite formats: "UPS Standard", "FedEx Express", etc.
  if (/ups/i.test(shippingMethod)) return 'UPS';
  if (/fedex/i.test(shippingMethod)) return 'FedEx';
  if (/canada\s*post/i.test(shippingMethod)) return 'Postes Canada';
  return shippingMethod.split(' ')[0] ?? 'Carrier';
}

function extractService(shippingMethod: string, carrier: string): string {
  return shippingMethod.replace(new RegExp(`^${carrier}\\s*`, 'i'), '').trim() || 'Standard';
}

function trackingDeepLink(carrier: string, tracking: string): string {
  if (!tracking) return '';
  const c = carrier.toLowerCase();
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
  if (c.includes('postes') || c.includes('canada post')) return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(tracking)}`;
  return '';
}
