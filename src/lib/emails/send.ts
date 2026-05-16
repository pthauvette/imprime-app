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
import { sendEmail } from './render';
import type {
  OrderConfirmationVars,
  OrderShippedVars,
  OrderDeliveredVars,
  OrderCancelledVars,
  RefundIssuedVars,
} from './vars';

// ─── FORMATTERS ───────────────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

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

function unsubscribeUrl(): string {
  return `${APP_URL}/settings#email-preferences`;
}

// ─── SEND HELPERS ─────────────────────────────────────────────────────────

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
    PRODUCT_NAME: 'Cartes de visite', // TODO: resolve via Sinalite product detail
    SUBTOTAL: cad(order.subtotalCents),
    SHIPPING: cad(order.shippingCents),
    TAX: cad(order.taxCents),
    TOTAL: cad(order.amountCents),
    SHIPPING_METHOD: order.shippingMethod,
    SHIP_CITY: order.shipCity,
    SHIP_ADDRESS_HTML: shipAddressHtml(order),
    TRACK_ORDER_URL: orderUrl(order),
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return tryCatch(() => sendEmail({
    to: user.email,
    template: 'order-confirmation',
    vars: vars as unknown as Record<string, string | number>,
  }), 'order-confirmation', order.id);
}

/** Envoyé sur webhook Sinalite status=SHIPPED. */
export async function sendOrderShippedEmail(input: {
  order: Order;
  user: User;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: Date;
}) {
  const { order, user } = input;
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
  return tryCatch(() => sendEmail({
    to: user.email,
    template: 'order-shipped',
    vars: vars as unknown as Record<string, string | number>,
  }), 'order-shipped', order.id);
}

/** Envoyé sur webhook Sinalite status=DELIVERED. */
export async function sendOrderDeliveredEmail(input: {
  order: Order;
  user: User;
  deliveredAt?: Date;
}) {
  const { order, user } = input;
  const deliveredAt = input.deliveredAt ?? new Date();
  const vars: OrderDeliveredVars = {
    CUSTOMER_FIRST_NAME: firstName(user),
    CUSTOMER_NAME: fullName(user),
    ORDER_ID: order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase(),
    DELIVERED_AT_FORMATTED: `${timeFr(deliveredAt)} le ${dateFr(deliveredAt)}`,
    QUANTITY: order.itemsCount,
    PRODUCT_NAME: 'Cartes de visite', // TODO: resolve via Sinalite product detail
    TOTAL: cad(order.amountCents),
    REORDER_URL: `${APP_URL}/order/start?reorder=${order.id}`,
    FEEDBACK_URL: `${APP_URL}/orders/${order.id}?feedback=true`,
    UNSUBSCRIBE_URL: unsubscribeUrl(),
  };
  return tryCatch(() => sendEmail({
    to: user.email,
    template: 'order-delivered',
    vars: vars as unknown as Record<string, string | number>,
  }), 'order-delivered', order.id);
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
  return tryCatch(() => sendEmail({
    to: user.email,
    template: 'order-cancelled',
    vars: vars as unknown as Record<string, string | number>,
  }), 'order-cancelled', order.id);
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
  return tryCatch(() => sendEmail({
    to: user.email,
    template: 'refund-issued',
    vars: vars as unknown as Record<string, string | number>,
  }), 'refund-issued', order.id);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

async function tryCatch<T>(fn: () => Promise<T>, label: string, orderId: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    // Email = best-effort. On log mais on ne crash pas le webhook.
    console.error(`[email] ${label} failed for order ${orderId}:`, err);
    return null;
  }
}

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
