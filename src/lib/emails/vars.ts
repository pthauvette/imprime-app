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

export type WelcomeVars = {
  CUSTOMER_FIRST_NAME: string;
  TEMPLATES_URL: string;
  ORDER_START_URL: string;
  CATALOG_URL: string;
  UNSUBSCRIBE_URL: string;
  /** #8.3 — bloc HTML du code promo de bienvenue (vide si l'inscription ne vient
   *  pas de la page promo). Injecté tel quel (moteur de template sans conditionnel). */
  WELCOME_PROMO_HTML: string;
};

export type OrderConfirmationVars = {
  CUSTOMER_FIRST_NAME: string;
  CUSTOMER_NAME: string;
  ORDER_ID: string | number;
  QUANTITY: string | number;
  PRODUCT_NAME: string;
  /** Bloc HTML inline-styled qui itemize la commande (un bloc par item du
   *  itemsSnapshot). Pour multi-item orders. Fallback à un bloc unique
   *  si pas de snapshot. */
  ITEMS_HTML: string;
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
  // Bloc reçu légal (Loi sur la taxe d'accise art. 169 + Loi TVQ art. 350).
  // Requis sur tout reçu pour permettre au client B2B de réclamer ses CTI/RTI.
  COMPANY_LEGAL_NAME: string;
  /** Adresse complète sur 1 ligne (postal address légale du vendeur). */
  COMPANY_ADDRESS: string;
  /** Numéro TPS/GST format "123456789 RT0001". */
  COMPANY_GST_NUMBER: string;
  /** Numéro TVQ/QST format "1234567890 TQ0001". */
  COMPANY_QST_NUMBER: string;
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
  /** Bloc HTML de la mini-timeline 4 étapes (toutes done à ce stade).
   *  Généré par renderLifecycleTimeline(4). */
  LIFECYCLE_TIMELINE_HTML: string;
  UNSUBSCRIBE_URL: string;
};

export type PaymentFailedVars = {
  CUSTOMER_FIRST_NAME: string;
  ORDER_ID: string | number;
  /** Message lisible de la banque (Stripe last_payment_error.message). */
  FAILURE_REASON: string;
  /** Lien vers le wizard pour recommencer (typiquement /order/start). */
  RETRY_URL: string;
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
  UNSUBSCRIBE_URL: string;
};

export type AdminCustomMessageVars = {
  ORDER_ID: string | number;
  /** Subject de l'email (devient aussi le H1 de l'email). */
  SUBJECT: string;
  /** Preview du body affiché dans l'inbox preview. */
  PREVIEW: string;
  /** Body HTML pré-formaté (paragraphes <p>) — caller sanitize. */
  BODY_HTML: string;
  ORDER_URL: string;
  SENDER_NAME: string;
  SENDER_EMAIL: string;
  /** Unsub link CASL-required quand l'email est utilisé pour broadcast.
   *  Optionnel : pour les vrais messages 1-to-1 admin → customer, on peut
   *  laisser vide (le template a un fallback "Réponds directement"). */
  UNSUBSCRIBE_URL?: string;
};

export type AdminDailySummaryVars = {
  /** Pre-formatted date (e.g. "samedi 17 mai 2026"). */
  DATE_FORMATTED: string;
  /** Headline phrase, e.g. "12 commandes hier" or "Journée tranquille". */
  HEADLINE: string;
  /** Inbox preview line (hidden in body but shown in mail list). */
  HEADLINE_PREVIEW: string;
  REVENUE_24H: string;
  ORDERS_24H: string | number;
  FAILURES_24H: string | number;
  /** CSS color literal for failures count (#B83A2C if >0, #4A554D if 0). */
  FAILURES_COLOR: string;
  /** Pre-rendered HTML block of failed-order rows; empty string if none. */
  FAILURES_BLOCK_HTML: string;
  COUNT_PAID: string | number;
  COUNT_SUBMITTED: string | number;
  COUNT_IN_PRODUCTION: string | number;
  COUNT_SHIPPED: string | number;
  COUNT_DELIVERED: string | number;
  COUNT_FAILED: string | number;
  NEW_USERS_24H: string | number;
  /** "" (singular) or "s" (plural) — pre-formatted. */
  NEW_USERS_PLURAL: string;
  AVG_BASKET: string;
  DASHBOARD_URL: string;
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
/** Round 4 #2 — email envoyé quand une demande reseller est APPROUVÉE. */
export type ResellerApprovedVars = {
  CONTACT_FIRST_NAME: string;
  COMPANY_NAME: string;
  /** Où voir/profiter du statut (dashboard compte). */
  RESELLER_URL: string;
  ORDER_START_URL: string;
};

export type EmailVarsMap = {
  'magic-link': MagicLinkVars;
  'welcome': WelcomeVars;
  'reseller-approved': ResellerApprovedVars;
  'order-confirmation': OrderConfirmationVars;
  'order-shipped': OrderShippedVars;
  'order-delivered': OrderDeliveredVars;
  'order-cancelled': OrderCancelledVars;
  'payment-failed': PaymentFailedVars;
  'refund-issued': RefundIssuedVars;
  'admin-daily-summary': AdminDailySummaryVars;
  'admin-custom-message': AdminCustomMessageVars;
  'reengagement-follow-up': ReengagementFollowUpVars;
  'reengagement-winback': ReengagementWinbackVars;
  'abandoned-cart': AbandonedCartVars;
  'reseller-monthly-stats': ResellerMonthlyStatsVars;
};

export type ReengagementFollowUpVars = {
  CUSTOMER_FIRST_NAME: string;
  ORDER_ID: string | number;
  PRODUCT_SUMMARY: string;
  /** URL vers /reviews/submit?orderId=X&token=Y (HMAC déjà inclus). */
  REVIEW_URL: string;
  /** Deep-link vers /order/start?reorder=ORDER_ID. */
  REORDER_URL: string;
  UNSUBSCRIBE_URL: string;
};

export type AbandonedCartVars = {
  CUSTOMER_FIRST_NAME: string;
  /** Nom du produit dans la phrase "ta commande de X t'attend". */
  PRODUCT_NAME: string;
  /** Deep-link vers /order/review (ou la dernière étape) avec query string
   *  pré-remplie pour reprendre exactement où le user a quitté. */
  RESUME_URL: string;
  UNSUBSCRIBE_URL: string;
};

export type ReengagementWinbackVars = {
  CUSTOMER_FIRST_NAME: string;
  /** Code promo dynamique généré pour ce user (ex: "REVIENS10"). */
  PROMO_CODE: string;
  /** Label friendly ("10 %" ou "10,00 $"). */
  DISCOUNT_LABEL: string;
  /** Number de jours depuis la dernière commande payée. */
  DAYS_SINCE_LAST: string | number;
  ORDER_START_URL: string;
  UNSUBSCRIBE_URL: string;
};

/**
 * Round 24 #4 — récap mensuel envoyé le 1er du mois à tous les resellers
 * VERIFIED qui ont au moins 1 order le mois écoulé.
 */
export type ResellerMonthlyStatsVars = {
  CUSTOMER_FIRST_NAME: string;
  /** Ex: "janvier 2026". */
  MONTH_LABEL: string;
  /** Count des orders payées le mois écoulé. */
  ORDERS_COUNT: string | number;
  /** Total dépensé, format ex: "1 234,56". */
  REVENUE: string;
  /** Rabais 5 % cumulé, format ex: "61,73". 0 si aucune order. */
  DISCOUNT_SAVED: string;
  /** Phrase courte, ex: "vs mois précédent : +12 %" ou "Premier mois actif". */
  COMPARISON_LABEL: string;
  /** Détail optionnel (ex: nb d'orders vs nb d'orders précédent). */
  COMPARISON_DETAIL: string;
  /** Headline encadré status — ex: "Status : RESELLER VERIFIED". */
  STATUS_HEADLINE: string;
  /** Détail encadré — ex: "Tes orders contribuent à débloquer le statut Power-User…" */
  STATUS_DETAIL: string;
  DASHBOARD_URL: string;
  UNSUBSCRIBE_URL: string;
};
