/**
 * Sinalite API types — derived from live exploration of
 * api.sinalite.com + apifrontend_stage.sinaliteuppy.com (mai 2026).
 *
 * IMPORTANT corrections vs la doc publique:
 *  • storeCode is "en_ca" / "en_us" (string), NOT 6/9 numeric
 *  • endpoint variant lookup is /pricebykey (not /pricedbykey)
 */

import { z } from 'zod';

/** "en_ca" | "en_us" — Plio ne supporte que en_ca. */
export const StoreCode = z.enum(['en_ca', 'en_us']);
export type StoreCode = z.infer<typeof StoreCode>;

// ─── AUTH ─────────────────────────────────────────────────────────────────

export const SinaliteTokenResponse = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().optional(),
});
export type SinaliteTokenResponse = z.infer<typeof SinaliteTokenResponse>;

// ─── PRODUCTS ─────────────────────────────────────────────────────────────

export const SinaliteProduct = z.object({
  id: z.number(),
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  enabled: z.union([z.literal(0), z.literal(1)]),
});
export type SinaliteProduct = z.infer<typeof SinaliteProduct>;

export const SinaliteProductList = z.array(SinaliteProduct);

/** One option from /product/{id}/{storeCode} array[0]. */
export const SinaliteOption = z.object({
  id: z.number(),
  group: z.string(),
  name: z.string(),
});
export type SinaliteOption = z.infer<typeof SinaliteOption>;

/** One pricing combination — md5(sortedOptionIds) → value. */
export const SinalitePricing = z.object({
  hash: z.string(),
  value: z.string(),
});
export type SinalitePricing = z.infer<typeof SinalitePricing>;

/** Metadata flags — `custom_size`, `shapes`, etc. */
export const SinaliteMeta = z.object({
  metadata: z.string(),
});
export type SinaliteMeta = z.infer<typeof SinaliteMeta>;

/** Tuple shape returned by GET /product/{id}/{storeCode}. */
export const SinaliteProductDetail = z.tuple([
  z.array(SinaliteOption),
  z.array(SinalitePricing),
  z.array(SinaliteMeta),
]);
export type SinaliteProductDetail = z.infer<typeof SinaliteProductDetail>;

/** Variant from GET /variants/{id}/{offset}. */
export const SinaliteVariant = z.object({
  price: z.number(),
  /** Hyphen-joined sorted option IDs (e.g. "5-140-447-448"). */
  key: z.string(),
});
export type SinaliteVariant = z.infer<typeof SinaliteVariant>;

// ─── PRICE ────────────────────────────────────────────────────────────────

export const SinalitePackageInfo = z.object({
  'total weight': z.union([z.string(), z.number()]),
  'weight per box': z.union([z.string(), z.number()]),
  'Units Per Box': z.union([z.string(), z.number()]),
  'box size': z.string(),
  'number of boxes': z.union([z.string(), z.number()]),
});
export type SinalitePackageInfo = z.infer<typeof SinalitePackageInfo>;

export const SinalitePriceResponse = z.object({
  price: z.string(),
  packageInfo: SinalitePackageInfo,
  productOptions: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type SinalitePriceResponse = z.infer<typeof SinalitePriceResponse>;

// ─── ORDER ────────────────────────────────────────────────────────────────

export const ShipMethod = z.enum([
  'UPS Standard',
  'UPS Expedited',
  'UPS Express Saver',
  'UPS Express',
  'UPS Saver',
  'UPS Worldwide Expedited',
  'FedEx Standard Overnight',
  'FedEx Economy',
  'FedEx Express Saver',
  'FedEx International Economy',
  'FedEx International Priority',
]);
export type ShipMethod = z.infer<typeof ShipMethod>;

/** CA only — pour Plio. */
export const CaProvince = z.enum([
  'AB', 'BC', 'MB', 'NL', 'NB', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT',
]);
export type CaProvince = z.infer<typeof CaProvince>;

/** Postal code A1A 1A1. */
export const CaPostalCode = z.string().regex(
  /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/,
  'Code postal canadien invalide (format A1A 1A1)',
);

export const SinaliteShippingInfo = z.object({
  ShipFName: z.string(),
  ShipLName: z.string(),
  ShipEmail: z.string().email(),
  ShipAddr: z.string(),
  ShipAddr2: z.string().default(''),
  ShipCity: z.string(),
  ShipState: CaProvince,
  ShipZip: z.string(),
  ShipCountry: z.literal('CA'),
  ShipPhone: z.string(),
  ShipMethod: ShipMethod,
});
export type SinaliteShippingInfo = z.infer<typeof SinaliteShippingInfo>;

export const SinaliteBillingInfo = SinaliteShippingInfo
  .omit({ ShipMethod: true })
  .extend({
    BillFName: z.string(),
    BillLName: z.string(),
    BillEmail: z.string().email(),
    BillAddr: z.string(),
    BillAddr2: z.string().default(''),
    BillCity: z.string(),
    BillState: CaProvince,
    BillZip: z.string(),
    BillCountry: z.literal('CA'),
    BillPhone: z.string(),
  })
  .pick({
    BillFName: true, BillLName: true, BillEmail: true,
    BillAddr: true, BillAddr2: true, BillCity: true,
    BillState: true, BillZip: true, BillCountry: true,
    BillPhone: true,
  });
export type SinaliteBillingInfo = z.infer<typeof SinaliteBillingInfo>;

export const SinaliteFile = z.object({
  type: z.enum(['front', 'back']),
  url: z.string().url(),
});
export type SinaliteFile = z.infer<typeof SinaliteFile>;

export const SinaliteOrderItem = z.object({
  productId: z.number(),
  /** Per Sinalite: option name → option ID as string. Roll labels = object of strings. */
  options: z.record(z.string(), z.string()),
  files: z.array(SinaliteFile).min(1),
  /** Custom reference for reseller — ID interne. */
  extra: z.string().optional(),
});
export type SinaliteOrderItem = z.infer<typeof SinaliteOrderItem>;

export const SinaliteOrderRequest = z.object({
  items: z.array(SinaliteOrderItem).min(1),
  shippingInfo: SinaliteShippingInfo,
  billingInfo: SinaliteBillingInfo,
  notes: z.string().optional(),
});
export type SinaliteOrderRequest = z.infer<typeof SinaliteOrderRequest>;

export const SinaliteOrderResponse = z.object({
  message: z.string(),
  orderId: z.number(),
  status: z.literal('success'),
});
export type SinaliteOrderResponse = z.infer<typeof SinaliteOrderResponse>;

// ─── SHIPPING ESTIMATE ────────────────────────────────────────────────────

export const SinaliteShippingEstimateRequest = z.object({
  // Audit v2 #6.4 — borne haute : sans cap, un payload géant amplifiait le
  // coût/latence du proxy Sinalite (1 commande = quelques items au plus).
  items: z.array(z.object({
    productId: z.number(),
    options: z.record(z.string(), z.string()),
  })).min(1).max(20),
  shippingInfo: z.object({
    ShipState: CaProvince,
    ShipZip: z.string(),
    ShipCountry: z.literal('CA'),
  }),
});
export type SinaliteShippingEstimateRequest = z.infer<
  typeof SinaliteShippingEstimateRequest
>;

/** Response is array of [carrier, method, price, days]. */
export const SinaliteShippingMethod = z.tuple([
  z.string(),  // carrier
  ShipMethod,
  z.number(),  // price in CAD
  z.number(),  // shipping days
]);

export const SinaliteShippingEstimateResponse = z.object({
  statusCode: z.number(),
  body: z.array(SinaliteShippingMethod),
});
export type SinaliteShippingEstimateResponse = z.infer<
  typeof SinaliteShippingEstimateResponse
>;

// ─── ORDER LIST/DETAIL (hidden endpoints discovered live) ─────────────────

export const OrderStatus = z.enum([
  'NEW', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const SinaliteOrderListItem = z.object({
  id: z.number(),
  total: z.number(),
  discount: z.number().nullable(),
  tax: z.number(),
  ShipCompany: z.string().nullable(),
  ShipFName: z.string(),
  ShipLName: z.string(),
  ShipEmail: z.string(),
  ShipAddr: z.string(),
  ShipAddr2: z.string(),
  ShipCity: z.string(),
  ShipState: z.string(),
  ShipZip: z.string(),
  ShipCountry: z.string(),
  ShipPhone: z.string(),
  ShipMethod: z.string(),
  BillCompany: z.string().nullable(),
  BillFName: z.string(),
  BillLName: z.string(),
  BillEmail: z.string(),
  BillAddr: z.string(),
  BillAddr2: z.string(),
  BillCity: z.string(),
  BillState: z.string(),
  BillZip: z.string(),
  BillCountry: z.string(),
  BillPhone: z.string(),
  FreightCost: z.number(),
  Notes: z.string().nullable(),
  status: OrderStatus,
  created_time: z.string(),
  updated_time: z.string(),
  payment_charged: z.union([z.literal(0), z.literal(1)]),
});
export type SinaliteOrderListItem = z.infer<typeof SinaliteOrderListItem>;

export const SinaliteOrderDetailItem = z.object({
  id: z.number(),
  order_id: z.number(),
  product_id: z.number(),
  price: z.number(),
  tax: z.number(),
  total: z.number(),
  /** JSON-encoded string. */
  options: z.string(),
  /** JSON-encoded array of option IDs as strings. */
  optionsRaw: z.string(),
  /** JSON-encoded SinalitePackageInfo. */
  packageInfo: z.string(),
  /** JSON-encoded array of SinaliteFile. */
  files: z.string(),
  status: OrderStatus,
  created_time: z.string(),
});
export type SinaliteOrderDetailItem = z.infer<typeof SinaliteOrderDetailItem>;

export const SinaliteOrderDetail = z.object({
  order: SinaliteOrderListItem,
  items: z.array(SinaliteOrderDetailItem),
});
export type SinaliteOrderDetail = z.infer<typeof SinaliteOrderDetail>;
