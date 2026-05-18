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
import { buildItemsSnapshot } from '@/lib/orders/items';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { normalizeCode, validatePromo } from '@/lib/promo/validate';

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

  /**
   * Optional : si le user vient de l'éditeur de template, lier l'order au
   * DesignDraft pour analytics conversion (top performer per template).
   * Pas de validation stricte côté server — si le designId existe pas ou
   * appartient à un autre user, on log et on continue sans lier (best-effort).
   */
  designId: z.string().optional(),

  /**
   * Optional : code promo entré par l'user au checkout. On re-valide ici
   * côté serveur (le client peut tricher) et on rejette si invalide.
   */
  promoCode: z.string().min(1).max(64).optional(),
});

// ─── HANDLER ──────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: Request) => {
  const payload = await parseBody(req, CreateOrderSchema);

  // Phase 1: server-side price computation (anti-tampering).
  // Variants-index first (O(1) après le premier lookup grâce au cache 10 min),
  // fallback à POST /price/... pour les combos avec exclusions ou custom_size.
  const { lookupVariant } = await import('@/lib/sinalite/pricing');
  const { getEnrichedVariantIndex } = await import('@/lib/products/pricing');
  let subtotal = 0;
  // Cache product details across items for the same productId
  const detailCache = new Map<number, Awaited<ReturnType<typeof sinalite.getProductDetail>>>();
  // Map productId → human name, populated via sinalite.getProduct (cheap)
  const productNames = new Map<number, string>();
  for (const item of payload.items) {
    // Index enrichi : marginPct admin déjà appliqué. lookupVariant retourne
    // le prix avec markup directement, donc subtotal computé ici = total
    // attendu par le client (qui a vu ce même prix dans le wizard). Si
    // l'admin baisse la marge entre le wizard et le checkout, le check
    // expectedSubtotal va catch la divergence et forcer un refresh.
    const { index, marginPct } = await getEnrichedVariantIndex(item.productId);
    const local = lookupVariant(item.optionIds, index);

    if (local !== null) {
      subtotal += local;
    } else {
      const remote = await sinalite.getPrice(item.productId, item.optionIds);
      const remotePrice = parseFloat(remote.price);
      // Variant manquant de l'index → fallback Sinalite, mais on applique
      // quand même le markup admin pour rester cohérent avec le wizard.
      const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;
      subtotal += Math.round(remotePrice * multiplier * 100) / 100;
    }

    // Pre-fetch product detail for buildSinalitePayload phase
    if (!detailCache.has(item.productId)) {
      detailCache.set(item.productId, await sinalite.getProductDetail(item.productId));
    }
    // Pre-fetch product name (best-effort, fallback à "Produit Plio")
    if (!productNames.has(item.productId)) {
      const prod = await sinalite.getProduct(item.productId).catch(() => null);
      productNames.set(item.productId, prod?.name ?? 'Produit Plio');
    }
  }

  // Build human-readable summary : "Cartes 14pt Profit Maximizer (250)"
  // ou multi-items "Cartes (250) + Flyers (100)"
  const productSummary = payload.items
    .map((item, idx) => {
      const name = productNames.get(item.productId) ?? `Produit #${item.productId}`;
      // Pour MVP : 1 unité par item (Sinalite gère la quantité via les optionIds)
      // À enrichir si on a un vrai item.quantity dans le futur.
      return idx === 0 ? name : `+ ${name}`;
    })
    .join(' ');

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

  // Phase 2a: promo code (optional). Lookup + server-side re-validation.
  // Le client a peut-être affiché un discount via /api/promo/validate, mais
  // on doit re-valider ici parce qu'un attacker pourrait POST direct.
  let promoRecord: Awaited<ReturnType<typeof prisma.promoCode.findUnique>> | null = null;
  let discountAmount = 0;
  if (payload.promoCode) {
    const normalized = normalizeCode(payload.promoCode);
    promoRecord = await prisma.promoCode.findUnique({ where: { code: normalized } });
    // Pour firstOrderOnly : compter les orders existantes (status != PENDING)
    // du user qu'on va potentiellement créer/match plus bas. Comme le user
    // n'est pas encore créé, on fait le lookup par email pour les guests.
    let orderCountForUser = 0;
    const existingSession = await auth();
    if (existingSession?.user?.id) {
      orderCountForUser = await prisma.order.count({
        where: { userId: existingSession.user.id, status: { not: 'PENDING' } },
      });
    } else {
      const existingUser = await prisma.user.findUnique({
        where: { email: payload.contact.email.toLowerCase() },
        select: { _count: { select: { orders: { where: { status: { not: 'PENDING' } } } } } },
      });
      orderCountForUser = existingUser?._count.orders ?? 0;
    }
    const r = validatePromo(promoRecord, {
      subtotalCents: Math.round(subtotal * 100),
      orderCountForUser,
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: r.message, code: 'PROMO_INVALID', details: { failureCode: r.failureCode } },
        { status: 400 },
      );
    }
    discountAmount = r.discountCents / 100;
  }

  // Phase 2b: tax computation — taxe sur (subtotal - discount + shipping)
  const taxableSubtotal = subtotal - discountAmount + payload.shippingPrice;
  const tax = computeTax(taxableSubtotal, payload.shippingAddress.province);
  const totalCents = Math.round((taxableSubtotal + tax.total) * 100);

  // Phase 3: build the Sinalite payload (will be POSTed by webhook after Stripe confirms)
  const sinalitePayload = buildSinalitePayload(payload, detailCache);
  // Phase 3b: build the display-friendly snapshot persisted in Order.itemsSnapshot
  // pour render itemized sur /orders, /orders/[id], emails — sans refetch Sinalite.
  const itemsSnapshot = buildItemsSnapshot(sinalitePayload, detailCache, productNames);

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

  const newOrder = await createPendingOrder({
    userId: user.id,
    paymentIntentId: paymentIntent.id,
    amountCents: totalCents,
    itemsCount: payload.items.length,
    subtotalCents: Math.round(subtotal * 100),
    shippingCents: Math.round(payload.shippingPrice * 100),
    taxCents: Math.round(tax.total * 100),
    discountCents: Math.round(discountAmount * 100),
    promoCodeId: promoRecord?.id,
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
    productSummary,
    itemsSnapshot,
  });

  // Phase 5b : best-effort link au DesignDraft si le user vient de l'éditeur.
  // Ne fail PAS la commande si le link ne marche pas (designId invalide,
  // déjà lié à un autre order, etc.) — c'est de l'analytics, pas critique.
  if (payload.designId) {
    try {
      await prisma.designDraft.update({
        where: { id: payload.designId },
        data: { orderId: newOrder.id },
      });
    } catch (err) {
      console.warn(
        `[orders/create] could not link designDraft ${payload.designId} to order ${newOrder.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    breakdown: {
      subtotal,
      discount: discountAmount,
      promoCode: promoRecord?.code ?? null,
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
