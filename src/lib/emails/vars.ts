/**
 * Type-safe vars per email template — keeps webhook wiring honest.
 *
 * Each type below mirrors the `{{VAR}}` placeholders inside the matching
 * `templates/email-<name>.html` file. Use these as the `vars` argument to
 * `sendEmail()` (see `./render.ts`) so the compiler catches missing or
 * typo'd fields before SES does.
 *
 * Conventions:
 *   - Numeric / monetary fields are typed `string | number` so callers can
 *     pass either `42` or a pre-formatted `"187,42"`. The renderer coerces
 *     to string via `String(value)`.
 *   - `*_FORMATTED` fields are always pre-formatted human-readable strings
 *     (e.g. "mercredi 18 mai", "14h32 aujourd'hui"). Format on the caller
 *     side so we keep locale logic out of the template layer.
 *   - `SHIP_ADDRESS_HTML` is a pre-formatted HTML block (multi-line address
 *     with `<br />` separators). The renderer does NOT escape values, so it
 *     is the caller's responsibility to sanitize any user-supplied content.
 *   - `*_URL` fields must be fully-qualified absolute URLs.
 */

export type MagicLinkVars = {
  MAGIC_LINK_URL: string;
  UNSUBSCRIBE_URL: string;
};

export type OrderConfirmationVars = {
  CUSTOMER_FIRST_NAME: string;
  CUSTOMER_NAME: string;
  ORDER_ID: string | number;
  QUANTITY: string | number;
  PRODUCT_NAME: string;
  SUBTOTAL: string;
  SHIPPING: string;
  TAX: string;
  TOTAL: string;
  SHIPPING_METHOD: string;
  SHIP_CITY: string;
  /** Pre-formatted HTML address block (with `<br />` line breaks). */
  SHIP_ADDRESS_HTML: string;
  TRACK_ORDER_URL: string;
  UNSUBSCRIBE_URL: string;
};

export type OrderShippedVars = {
  CUSTOMER_FIRST_NAME: string;
  CUSTOMER_NAME: string;
  ORDER_ID: string | number;
  CARRIER: string;
  CARRIER_SERVICE: string;
  TRACKING_NUMBER: string;
  /** Full carrier deep-link URL (e.g. https://www.ups.com/track?tracknum=...). */
  TRACK_URL: string;
  /** Pre-formatted ETA (e.g. "mercredi 18 mai"). */
  ETA_FORMATTED: string;
  /** Pre-formatted HTML address block (with `<br />` line breaks). */
  SHIP_ADDRESS_HTML: string;
  ORDER_URL: string;
  UNSUBSCRIBE_URL: string;
};

export type OrderDeliveredVars = {
  CUSTOMER_FIRST_NAME: string;
  CUSTOMER_NAME: string;
  ORDER_ID: string | number;
  /** Pre-formatted delivery timestamp (e.g. "à 14h32 aujourd'hui"). */
  DELIVERED_AT_FORMATTED: string;
  QUANTITY: string | number;
  PRODUCT_NAME: string;
  TOTAL: string;
  FEEDBACK_URL: string;
  REORDER_URL: string;
  UNSUBSCRIBE_URL: string;
};

export type OrderCancelledVars = {
  CUSTOMER_FIRST_NAME: string;
  CUSTOMER_NAME: string;
  ORDER_ID: string | number;
  REFUND_AMOUNT: string;
  /** Free-form reason string shown in the "Raison" callout. */
  CANCEL_REASON: string;
  /** Pre-formatted card display (e.g. "Visa •••• 4242"). */
  CARD_LAST4_DISPLAY: string;
  /** Promo code to be shown in the apology block (e.g. "DÉSOLÉ20"). */
  APOLOGY_PROMO_CODE: string;
  UNSUBSCRIBE_URL: string;
};

export type RefundIssuedVars = {
  /** Refund amount, pre-formatted (e.g. "54,20"). Currency symbol is in the template. */
  AMOUNT: string;
  ORDER_ID: string | number;
  /** Pre-formatted refund date (e.g. "16 mai 2026"). */
  REFUND_DATE_FORMATTED: string;
  /** Pre-formatted card display (e.g. "Visa •••• 4242"). */
  CARD_LAST4_DISPLAY: string;
  /** Free-form reason string (e.g. "Erreur de stock"). */
  REFUND_REASON: string;
  ORDER_URL: string;
  UNSUBSCRIBE_URL: string;
};

/**
 * Discriminated map from EmailTemplate name to its vars type.
 * Use to type the `sendEmail` call site if you want full inference:
 *
 *   sendEmail({ template: 'order-confirmation', vars: {...} as EmailVarsMap['order-confirmation'] })
 */
export type EmailVarsMap = {
  'magic-link': MagicLinkVars;
  'order-confirmation': OrderConfirmationVars;
  'order-shipped': OrderShippedVars;
  'order-delivered': OrderDeliveredVars;
  'order-cancelled': OrderCancelledVars;
  'refund-issued': RefundIssuedVars;
};
