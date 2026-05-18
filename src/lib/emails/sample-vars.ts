/**
 * Sample vars par template — utilisé par /admin/email-preview pour
 * rendre des aperçus réalistes sans avoir à composer des objets de
 * test à la main.
 *
 * Les valeurs sont volontairement fr-CA et réalistes (numéros SIN-XXXXX,
 * adresses Montréal, montants typiques) pour que le rendu soit représen-
 * tatif de ce qu'un vrai customer recevra.
 */

import type { EmailTemplate } from './render';
import type { EmailVarsMap } from './vars';
import { renderLifecycleTimeline } from './lifecycle-timeline';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

const SHIP_ADDRESS_HTML = `Sophie Beauchamp<br>
1234 rue Saint-Denis, app 304<br>
Montréal, QC H2J 2K9<br>
(514) 555-1234`;

const SAMPLE_ITEMS_HTML = `
<div style="padding:14px 0; border-bottom:1px solid #ECEAE3;">
  <p style="margin:0 0 6px 0; font-size:15px; font-weight:600; color:#141C16;">
    Cartes professionnelles 14pt UV
  </p>
  <div>
    <span style="display:inline-block; margin-right:6px; margin-bottom:4px; padding:4px 10px; background:#E5EDE8; color:#1F3D2B; border-radius:9999px; font-size:11px; font-family:ui-monospace,'SF Mono',Menlo,monospace; letter-spacing:0.04em; text-transform:uppercase; font-weight:600;">3.5 × 2</span>
    <span style="display:inline-block; margin-right:6px; margin-bottom:4px; padding:4px 10px; background:#E5EDE8; color:#1F3D2B; border-radius:9999px; font-size:11px; font-family:ui-monospace,'SF Mono',Menlo,monospace; letter-spacing:0.04em; text-transform:uppercase; font-weight:600;">14pt</span>
    <span style="display:inline-block; margin-right:6px; margin-bottom:4px; padding:4px 10px; background:#E5EDE8; color:#1F3D2B; border-radius:9999px; font-size:11px; font-family:ui-monospace,'SF Mono',Menlo,monospace; letter-spacing:0.04em; text-transform:uppercase; font-weight:600;">UV brillante</span>
    <span style="display:inline-block; margin-right:6px; margin-bottom:4px; padding:4px 10px; background:#E5EDE8; color:#1F3D2B; border-radius:9999px; font-size:11px; font-family:ui-monospace,'SF Mono',Menlo,monospace; letter-spacing:0.04em; text-transform:uppercase; font-weight:600;">500 unités</span>
  </div>
</div>
`.trim();

export const SAMPLE_VARS: { [K in keyof EmailVarsMap]: EmailVarsMap[K] } = {
  'magic-link': {
    MAGIC_LINK_URL: `${APP_URL}/api/auth/callback/email?token=preview&email=test%40plio.ca`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'welcome': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    TEMPLATES_URL: `${APP_URL}/templates`,
    ORDER_START_URL: `${APP_URL}/order/start`,
    CATALOG_URL: `${APP_URL}/templates`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'order-confirmation': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    CUSTOMER_NAME: 'Sophie Beauchamp',
    ORDER_ID: 'SIN-48312',
    QUANTITY: 500,
    PRODUCT_NAME: 'Cartes professionnelles 14pt UV',
    ITEMS_HTML: SAMPLE_ITEMS_HTML,
    SUBTOTAL: '79,00',
    SHIPPING: '12,50',
    TAX: '13,72',
    TOTAL: '105,22',
    SHIPPING_METHOD: 'Standard 3-5 jours',
    SHIP_CITY: 'Montréal',
    SHIP_ADDRESS_HTML,
    TRACK_ORDER_URL: `${APP_URL}/track?orderId=SIN-48312&email=test%40plio.ca`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
    COMPANY_LEGAL_NAME: 'Démocratik inc.',
    COMPANY_ADDRESS: '4321 boul. Saint-Laurent, Montréal QC H2W 1Z6',
    COMPANY_GST_NUMBER: '123456789 RT0001',
    COMPANY_QST_NUMBER: '1234567890 TQ0001',
  },
  'order-shipped': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    CUSTOMER_NAME: 'Sophie Beauchamp',
    ORDER_ID: 'SIN-48312',
    CARRIER: 'UPS',
    CARRIER_SERVICE: 'Standard',
    TRACKING_NUMBER: '1Z999AA10123456784',
    TRACK_URL: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
    ETA_FORMATTED: 'mercredi 20 mai',
    SHIP_ADDRESS_HTML,
    ORDER_URL: `${APP_URL}/orders/example`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'order-delivered': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    CUSTOMER_NAME: 'Sophie Beauchamp',
    ORDER_ID: 'SIN-48312',
    DELIVERED_AT_FORMATTED: 'à 14h32 aujourd\'hui',
    QUANTITY: 500,
    PRODUCT_NAME: 'Cartes professionnelles 14pt UV',
    TOTAL: '105,22',
    FEEDBACK_URL: `${APP_URL}/reviews/submit?orderId=example&token=preview`,
    REORDER_URL: `${APP_URL}/order/start?reorder=example`,
    // 4-step timeline avec toutes les étapes done — pour le delivered email.
    // Rendu via renderLifecycleTimeline(4) qui est dans @/lib/emails/
    // lifecycle-timeline (importé inline pour pas créer une circular).
    LIFECYCLE_TIMELINE_HTML: renderLifecycleTimeline(4),
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'order-cancelled': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    CUSTOMER_NAME: 'Sophie Beauchamp',
    ORDER_ID: 'SIN-48312',
    REFUND_AMOUNT: '105,22',
    CANCEL_REASON: 'Stock papier 14pt UV temporairement épuisé chez notre presse partenaire.',
    CARD_LAST4_DISPLAY: 'Visa •••• 4242',
    APOLOGY_PROMO_CODE: 'DESOLE20',
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'payment-failed': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    ORDER_ID: 'SIN-48312',
    FAILURE_REASON: 'Votre carte a été refusée par votre banque. Vérifiez le solde ou essayez une autre carte.',
    RETRY_URL: `${APP_URL}/order/start`,
  },
  'admin-custom-message': {
    ORDER_ID: 'SIN-48312',
    SUBJECT: '[Contact] Question avant achat — Sophie Beauchamp',
    PREVIEW: 'Bonjour, j\'ai une question sur les cartes 14pt vs 16pt — laquelle…',
    BODY_HTML: '<p style="margin:0 0 14px;">Bonjour,</p><p style="margin:0 0 14px;">J\'ai une question avant de commander : quelle est la différence entre les cartes 14pt et 16pt ? Le 16pt vaut-il vraiment 20 % de plus pour mon usage (cartes de visite réseau pro) ?</p><p style="margin:0;">Merci d\'avance, Sophie</p>',
    ORDER_URL: `${APP_URL}/admin/messages`,
    SENDER_NAME: 'Sophie Beauchamp',
    SENDER_EMAIL: 'sophie@studio.ca',
  },
  'admin-daily-summary': {
    DATE_FORMATTED: 'samedi 17 mai 2026',
    HEADLINE: '12 commandes hier',
    HEADLINE_PREVIEW: '12 commandes, 1 247,82 $ de revenu, 0 échec',
    REVENUE_24H: '1 247,82',
    ORDERS_24H: 12,
    FAILURES_24H: 0,
    FAILURES_COLOR: '#4A554D',
    FAILURES_BLOCK_HTML: '',
    COUNT_PAID: 3,
    COUNT_SUBMITTED: 2,
    COUNT_IN_PRODUCTION: 4,
    COUNT_SHIPPED: 2,
    COUNT_DELIVERED: 1,
    COUNT_FAILED: 0,
    NEW_USERS_24H: 4,
    NEW_USERS_PLURAL: 's',
    AVG_BASKET: '103,98',
    DASHBOARD_URL: `${APP_URL}/admin`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'refund-issued': {
    AMOUNT: '54,20',
    ORDER_ID: 'SIN-48312',
    REFUND_DATE_FORMATTED: '17 mai 2026',
    CARD_LAST4_DISPLAY: 'Visa •••• 4242',
    REFUND_REASON: 'Geste commercial suite à un retard de production de 2 jours.',
    ORDER_URL: `${APP_URL}/orders/example`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'reengagement-follow-up': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    ORDER_ID: 'SIN-48312',
    PRODUCT_SUMMARY: 'Cartes professionnelles 14pt UV',
    REVIEW_URL: `${APP_URL}/reviews/submit?orderId=example&token=preview`,
    REORDER_URL: `${APP_URL}/order/start?reorder=example`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
  'reengagement-winback': {
    CUSTOMER_FIRST_NAME: 'Sophie',
    PROMO_CODE: 'REVIENS9XK2',
    DISCOUNT_LABEL: '10 % de remise',
    DAYS_SINCE_LAST: 92,
    ORDER_START_URL: `${APP_URL}/order/start`,
    UNSUBSCRIBE_URL: `${APP_URL}/settings/email-preferences`,
  },
};

export const ALL_TEMPLATES: EmailTemplate[] = [
  'magic-link',
  'welcome',
  'order-confirmation',
  'order-shipped',
  'order-delivered',
  'order-cancelled',
  'payment-failed',
  'refund-issued',
  'admin-custom-message',
  'admin-daily-summary',
  'reengagement-follow-up',
  'reengagement-winback',
];

/**
 * Sample vars sous forme générique (Record) pour pouvoir passer à renderEmail
 * qui prend `Record<string, string | number>`.
 */
export function getSampleVars(template: EmailTemplate): Record<string, string | number> {
  return SAMPLE_VARS[template] as unknown as Record<string, string | number>;
}
