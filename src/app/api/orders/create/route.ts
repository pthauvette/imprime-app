/**
 * POST /api/orders/create
 *
 * Orchestration de la création de commande, en 4 phases:
 *
 *  1. Validation du payload (items, addresses, fichiers).
 *  2. Recompute server-side du prix total + taxes selon la province → ne JAMAIS
 *     trust le total client-side (sinon l'utilisateur peut overrider).
 *  3. Création d'un PaymentIntent Stripe (capture manuelle pour pouvoir
 *     refund si Sinalite échoue).
 *  4. À la confirmation côté client (PaymentElement), le webhook Stripe
 *     déclenche POST /order/new vers Sinalite — voir webhooks/stripe/route.ts.
 *
 * Renvoie le `clientSecret` Stripe pour que le front confirme le paiement.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { sinalite } from '@/lib/sinalite/client';
import { CaProvince, CaPostalCode, ShipMethod, type SinaliteOrderRequest } from '@/lib/sinalite/types';
import { computeTax } from '@/lib/taxes';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { findOrCreateUserByEmail, createPendingOrder } from '@/lib/db/orders';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

// ─── STRIPE ───────────────────────────────────────────────────────────────

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

// ─── PAYLOAD SCHEMA ───────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    productId: z.number(),
    /**
     * Option IDs (e.g. [4, 30, 107, 224, 78, 5]). Le BFF fetch le product detail
     * pour résoudre chaque ID en son nom de groupe ("Stock", "size", etc.).
     * Plus simple pour le front que de passer un map {groupName → optionId}.
     */
    optionIds: z.array(z.number()).min(1),
    /** Files déjà uploadés (URL signées vers notre stockage). */
    files: z.array(z.object({
      type: z.enum(['front', 'back']),
      url: z.string().url(),
    })).min(1),
    /** Internal reseller ID — passed as `extra` to Sinalite. */
    internalRef: z.string().optional(),
  })).min(1),

  contact: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(7),
  }),

  shippingAddress: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    province: CaProvince,
    postalCode: CaPostalCode,
  }),

  /** If undefined, billing = shipping. */
  billingAddress: z.object({
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    province: CaProvince,
    postalCode: CaPostalCode,
  }).optional(),

  shippingMethod: ShipMethod,
  shippingPrice: z.number().nonnegative(),

  /** Sub-total computed by client — server WILL recompute and verify. */
  expectedSubtotal: z.number().nonnegative(),

  notes: z.string().optional(),
});

// ─── HANDLER ──────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: Request) => {
  const payload = await parseBody(req, CreateOrderSchema);

  // Phase 1: server-side price computation (anti-tampering).
  // Variants-index first (O(1) après le premier lookup grâce au cache 10 min),
  // fallback à POST /price/... pour les combos avec exclusions ou custom_size.
  const { getVariantIndex, lookupVariant } = await import('@/lib/sinalite/pricing');
  let subtotal = 0;
  // Cache product details across items for the same productId
  const detailCache = new Map<number, Awaited<ReturnType<typeof sinalite.getProductDetail>>>();
  for (const item of payload.items) {
    const { index } = await getVariantIndex(item.productId);
    const local = lookupVariant(item.optionIds, index);

    if (local !== null) {
      subtotal += local;
    } else {
      const remote = await sinalite.getPrice(item.productId, item.optionIds);
      subtotal += parseFloat(remote.price);
    }

    // Pre-fetch product detail for buildSinalitePayload phase
    if (!detailCache.has(item.productId)) {
      detailCache.set(item.productId, await sinalite.getProductDetail(item.productId));
    }
  }

  // Tolerate $0.01 of rounding diff between client and server
  if (Math.abs(subtotal - payload.expectedSubtotal) > 0.05) {
    return NextResponse.json(
      {
        error: 'Le total a changé depuis le devis. Recharge la page.',
        code: 'PRICE_MISMATCH',
        details: { server: subtotal, client: payload.expectedSubtotal },
      },
      { status: 409 },
    );
  }

  // Phase 2: tax computation
  const taxableSubtotal = subtotal + payload.shippingPrice;
  const tax = computeTax(taxableSubtotal, payload.shippingAddress.province);
  const totalCents = Math.round((taxableSubtotal + tax.total) * 100);

  // Phase 3: build the Sinalite payload (will be POSTed by webhook after Stripe confirms)
  const sinalitePayload = buildSinalitePayload(payload, detailCache);

  // Phase 4: create PaymentIntent — automatic capture, full sinalitePayload
  // persisted in our DB (not Stripe metadata — too big for the 500-char limit).
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: 'cad',
    capture_method: 'automatic',
    automatic_payment_methods: { enabled: true },
    receipt_email: payload.contact.email,
    description: `Plio — ${payload.items.length} article(s)`,
    metadata: {
      // Stripe metadata is string-only, max 50 keys, values max 500 chars.
      // We keep only short pointers here; the full sinalitePayload lives in our DB.
      itemsCount: String(payload.items.length),
      province: payload.shippingAddress.province,
      shippingMethod: payload.shippingMethod,
      contactEmail: payload.contact.email,
    },
  });

  // Phase 5: persist a PENDING Order row. The Stripe webhook will look it up
  // by paymentIntentId, mark PAID, then submit to Sinalite.
  //
  // Si l'utilisateur est connecté : on attache l'order à son user.id (même
  // s'il a tapé un email contact différent). Sinon : lookup-or-create par
  // email — quand il se créera un compte plus tard avec ce même email,
  // Auth.js PrismaAdapter retombera sur le même User et l'historique sera là.
  const session = await auth();
  const user = session?.user
    ? await prisma.user.update({
        where: { id: session.user.id },
        data: {
          firstName: payload.contact.firstName,
          lastName: payload.contact.lastName,
          phone: payload.contact.phone,
        },
      })
    : await findOrCreateUserByEmail({
        email: payload.contact.email,
        firstName: payload.contact.firstName,
        lastName: payload.contact.lastName,
        phone: payload.contact.phone,
      });

  await createPendingOrder({
    userId: user.id,
    paymentIntentId: paymentIntent.id,
    amountCents: totalCents,
    itemsCount: payload.items.length,
    subtotalCents: Math.round(subtotal * 100),
    shippingCents: Math.round(payload.shippingPrice * 100),
    taxCents: Math.round(tax.total * 100),
    shippingMethod: payload.shippingMethod,
    province: payload.shippingAddress.province,
    shipName: `${payload.contact.firstName} ${payload.contact.lastName}`,
    shipLine1: payload.shippingAddress.line1,
    shipLine2: payload.shippingAddress.line2,
    shipCity: payload.shippingAddress.city,
    shipProvince: payload.shippingAddress.province,
    shipPostalCode: payload.shippingAddress.postalCode,
    shipPhone: payload.contact.phone,
    sinalitePayload,
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    breakdown: {
      subtotal,
      shipping: payload.shippingPrice,
      tax: tax.total,
      taxLines: tax.lines,
      total: taxableSubtotal + tax.total,
      currency: 'CAD',
    },
  });
});

/** Transforme le payload de l'app en format attendu par Sinalite /order/new. */
function buildSinalitePayload(
  p: z.infer<typeof CreateOrderSchema>,
  detailCache: Map<number, Awaited<ReturnType<typeof sinalite.getProductDetail>>>,
): SinaliteOrderRequest {
  const billing = p.billingAddress ?? p.shippingAddress;

  return {
    items: p.items.map((item) => {
      // Resolve each optionId → its group name (e.g. 30 → "Stock", 4 → "size")
      // Sinalite /order/new expects options as { "Stock": "30", "size": "4", ... }
      const detail = detailCache.get(item.productId);
      const options: Record<string, string> = {};
      if (detail) {
        for (const id of item.optionIds) {
          const opt = detail.options.find((o) => o.id === id);
          if (opt) options[opt.group] = String(id);
        }
      }
      return {
        productId: item.productId,
        options,
        files: item.files,
        ...(item.internalRef ? { extra: item.internalRef } : {}),
      };
    }),
    shippingInfo: {
      ShipFName: p.contact.firstName,
      ShipLName: p.contact.lastName,
      ShipEmail: p.contact.email,
      ShipAddr: p.shippingAddress.line1,
      ShipAddr2: p.shippingAddress.line2 ?? '',
      ShipCity: p.shippingAddress.city,
      ShipState: p.shippingAddress.province,
      ShipZip: p.shippingAddress.postalCode,
      ShipCountry: 'CA' as const,
      ShipPhone: p.contact.phone,
      ShipMethod: p.shippingMethod,
    },
    billingInfo: {
      BillFName: p.contact.firstName,
      BillLName: p.contact.lastName,
      BillEmail: p.contact.email,
      BillAddr: billing.line1,
      BillAddr2: billing.line2 ?? '',
      BillCity: billing.city,
      BillState: billing.province,
      BillZip: billing.postalCode,
      BillCountry: 'CA' as const,
      BillPhone: p.contact.phone,
    },
    ...(p.notes ? { notes: p.notes } : {}),
  };
}
