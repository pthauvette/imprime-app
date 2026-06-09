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
import { sinalite } from '@/lib/sinalite/client';
import { CaProvince, CaPostalCode, ShipMethod, type SinaliteOrderRequest } from '@/lib/sinalite/types';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { findOrCreateUserByEmail, createPendingOrder } from '@/lib/db/orders';
import { buildItemsSnapshot } from '@/lib/orders/items';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe/client';
import type { PriceOrderUser } from '@/lib/orders/price-order';

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

  /** Round 1 audit — sig HMAC du devis de livraison émis par /api/shipping/estimate.
   *  Optional pour l'instant (rollout : on logge, on ne rejette pas encore). */
  shippingQuoteSig: z.string().optional(),

  /** Round 26 #2 — instructions livraison customer (optionnel, max 200 chars).
   *  Forwardé à Sinalite + persisté sur Order.shippingNote. */
  shippingNote: z.string().trim().max(200).optional(),

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

  /**
   * Audit-vérif Funnel #2 — nonce STABLE par tentative de checkout (généré une
   * fois au montage de la page review). Combiné au hash de config pour la clé
   * d'idempotence Stripe : retries de la même tentative → même clé (pas de
   * double PaymentIntent), nouvelle tentative (rechargement) → nouvelle clé
   * (re-commande identique possible). Avant, la clé hashait internalRef =
   * `PLIO-${Date.now()}` → chaque appel était unique → idempotence neutralisée.
   */
  idempotencyKey: z.string().min(8).max(64).optional(),
});

// ─── HANDLER ──────────────────────────────────────────────────────────────

export const POST = withErrorHandler(async (req: Request) => {
  const payload = await parseBody(req, CreateOrderSchema);

  // ⚠️ SYNC : cette logique de prix (Phases 1-2) est désormais EXTRAITE à
  // l'identique dans src/lib/orders/price-order.ts (priceOrder), utilisée par le
  // MCP create_order Mode B. Tant que cette route n'est pas rewirée pour consommer
  // priceOrder (rewire prévu, behavior-preserving), TOUTE modif ici DOIT être
  // répliquée dans price-order.ts (sinon divergence web/MCP). price-order.ts est
  // couvert par price-order.test.ts (mêmes scénarios que orders-create.test.ts).
  //
  // Phase 1: server-side price computation (anti-tampering).
  // Variants-index first (O(1) après le premier lookup grâce au cache 10 min),
  // fallback à POST /price/... pour les combos avec exclusions ou custom_size.
  // Prix serveur — UNE seule source de vérité, partagée avec le MCP create_order
  // Mode B : src/lib/orders/price-order.ts (priceOrder). Le caller (cette route)
  // fournit les prefs user (DB) + orderCount ; priceOrder fait subtotal
  // (lookupVariant + fallback Sinalite + markup) avec gardes (PRODUCT_DISABLED /
  // OPTION_HIDDEN / PRICE_FETCH_FAILED), anti-tamper expectedSubtotal, promo, vérif
  // sig livraison (log/enforce), perks GOLD, reseller, taxe, crédits wallet→referral.
  // Séquence + arithmétique + précédence d'erreurs IDENTIQUES (move fidèle, couvert
  // par price-order.test ET orders-create.test).
  const { priceOrder } = await import('@/lib/orders/price-order');

  // Prefs user — source de vérité = DB user (jamais le payload). earlySession est
  // réutilisé plus bas (rattachement de l'Order au compte + breakdown UI).
  const earlySession = await auth();
  let userLoyaltyTier: string | null = null;
  let userResellerStatus: 'NONE' | 'AUTO_DETECTED' | 'VERIFIED' | 'PLATINUM' = 'NONE';
  let priceUser: PriceOrderUser | null = null;
  if (earlySession?.user?.id) {
    const userPrefs = await prisma.user.findUnique({
      where: { id: earlySession.user.id },
      select: { loyaltyTier: true, referralCreditCents: true, walletCents: true, taxExempt: true, resellerStatus: true },
    });
    userLoyaltyTier = userPrefs?.loyaltyTier ?? null;
    userResellerStatus = (userPrefs?.resellerStatus as typeof userResellerStatus) ?? 'NONE';
    priceUser = {
      loyaltyTier: userLoyaltyTier,
      resellerStatus: userResellerStatus,
      walletCents: userPrefs?.walletCents ?? 0,
      referralCreditCents: userPrefs?.referralCreditCents ?? 0,
      taxExempt: userPrefs?.taxExempt ?? false,
    };
  }

  // orderCountForUser (firstOrderOnly promo) — calculé UNIQUEMENT si un code promo
  // est fourni (comme avant). Commandes RÉELLEMENT HONORÉES : notIn PENDING/FAILED/
  // CANCELLED (cohérent avec l'award referral). earlySession réutilisé (1 seul auth()).
  let orderCountForUser = 0;
  if (payload.promoCode) {
    if (earlySession?.user?.id) {
      orderCountForUser = await prisma.order.count({
        where: { userId: earlySession.user.id, status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] } },
      });
    } else {
      const existingUser = await prisma.user.findUnique({
        where: { email: payload.contact.email.toLowerCase() },
        select: { _count: { select: { orders: { where: { status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] } } } } } },
      });
      orderCountForUser = existingUser?._count.orders ?? 0;
    }
  }

  const priced = await priceOrder({
    items: payload.items.map((it) => ({ productId: it.productId, optionIds: it.optionIds })),
    expectedSubtotal: payload.expectedSubtotal,
    province: payload.shippingAddress.province,
    postalCode: payload.shippingAddress.postalCode,
    shippingMethod: payload.shippingMethod,
    shippingPrice: payload.shippingPrice,
    shippingQuoteSig: payload.shippingQuoteSig,
    enforceShippingSig: process.env.ENFORCE_SHIPPING_SIG === '1',
    promoCode: payload.promoCode ?? null,
    contactEmail: payload.contact.email,
    itemCount: payload.items.length,
    user: priceUser,
    orderCountForUser,
  });
  if (!priced.ok) {
    return NextResponse.json(
      { error: priced.message, code: priced.code, ...(priced.details ? { details: priced.details } : {}) },
      { status: priced.status },
    );
  }
  const {
    subtotal,
    discountAmount,
    resellerDiscountAmount,
    effectiveShippingPrice,
    goldFreeShippingApplied,
    tax,
    grossTotalCents,
    walletCreditApplied,
    referralCreditApplied,
    totalCents,
    promoRecord,
    detailCache,
    productNames,
    productSummary,
  } = priced;

  // Phase 3: build the Sinalite payload (will be POSTed by webhook after Stripe confirms)
  const sinalitePayload = buildSinalitePayload(payload, detailCache);
  // Phase 3b: build the display-friendly snapshot persisted in Order.itemsSnapshot
  // pour render itemized sur /orders, /orders/[id], emails — sans refetch Sinalite.
  const itemsSnapshot = buildItemsSnapshot(sinalitePayload, detailCache, productNames);

  // Phase 4: create PaymentIntent — automatic capture, full sinalitePayload
  // persisted in our DB (not Stripe metadata — too big for the 500-char limit).
  //
  // Round 38 #3 + Audit-vérif Funnel #2 — clé d'idempotence Stripe.
  // Si le client double-clic ou retry après un timeout réseau, Stripe retourne
  // le même PI au lieu d'en créer 2 (= 2 charges potentielles).
  //
  // CORRECTION Funnel #2 : on N'inclut PLUS `payload.items` tel quel — il porte
  // `internalRef: PLIO-${Date.now()}` qui rendait CHAQUE appel unique → la clé
  // changeait à chaque retry → idempotence neutralisée. On hashe désormais la
  // config STABLE (productId + optionIds) + le promoCode (affecte le montant) +
  // un `attempt` nonce envoyé par le client (stable par tentative de checkout,
  // unique par rechargement de page). Résultat : retry d'une tentative → même
  // clé (dédup) ; nouvelle tentative ou re-commande identique → nouvelle clé.
  const { createHash } = await import('node:crypto');
  const idempotencyKey = `oc_${createHash('sha256')
    .update(JSON.stringify({
      attempt: payload.idempotencyKey ?? '',
      email: payload.contact.email.toLowerCase(),
      items: payload.items.map((it) => ({ productId: it.productId, optionIds: it.optionIds })),
      expectedSubtotal: payload.expectedSubtotal,
      shippingMethod: payload.shippingMethod,
      promoCode: payload.promoCode ?? null,
    }))
    .digest('hex')
    .slice(0, 48)}`;
  const paymentIntent = await getStripe().paymentIntents.create({
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
      referralCreditApplied: String(referralCreditApplied),
      ...(goldFreeShippingApplied && { goldFreeShipping: 'true' }),
    },
  }, { idempotencyKey });

  // Phase 5: persist a PENDING Order row. The Stripe webhook will look it up
  // by paymentIntentId, mark PAID, then submit to Sinalite.
  //
  // Si l'utilisateur est connecté : on attache l'order à son user.id (même
  // s'il a tapé un email contact différent). Sinon : lookup-or-create par
  // email — quand il se créera un compte plus tard avec ce même email,
  // Auth.js PrismaAdapter retombera sur le même User et l'historique sera là.
  // Note : on a déjà fait auth() en Phase 2c (earlySession) — réutilisé ici.
  //
  // Audit v3 M4 — pour un compte CONNECTÉ, on N'ÉCRIT PLUS son profil
  // (firstName/lastName/phone) avec payload.contact : c'est le contact de
  // LIVRAISON (le user a pu commander pour un tiers, ou saisir un autre nom).
  // Avant, un `prisma.user.update` inconditionnel écrasait l'identité du compte
  // à chaque commande → profil corrompu (reseller surtout) + contradiction avec
  // la rectification self-serve (#314). Le nom/tél de livraison vivent déjà sur
  // Order.ship* + sinalitePayload ; un compte au profil vide se complète via
  // /settings. On n'a besoin que de l'id ici.
  const userId = earlySession?.user
    ? earlySession.user.id
    : (
        await findOrCreateUserByEmail({
          email: payload.contact.email,
          firstName: payload.contact.firstName,
          lastName: payload.contact.lastName,
          phone: payload.contact.phone,
        })
      ).id;

  const newOrder = await createPendingOrder({
    userId,
    paymentIntentId: paymentIntent.id,
    amountCents: totalCents,
    itemsCount: payload.items.length,
    subtotalCents: Math.round(subtotal * 100),
    shippingCents: Math.round(effectiveShippingPrice * 100),
    taxCents: Math.round(tax.total * 100),
    discountCents: Math.round(discountAmount * 100),
    resellerDiscountCents: Math.round(resellerDiscountAmount * 100),
    referralCreditAppliedCents: referralCreditApplied,
    walletCreditAppliedCents: walletCreditApplied,
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
    // Round 26 #2 — instructions livraison customer (Order column)
    shippingNote: payload.shippingNote || null,
    sinalitePayload,
    productSummary,
    itemsSnapshot,
  });

  // Round 27 #1 — best-effort link au AbandonedCart si le user a cliqué
  // sur un recovery email récemment (30j) pour ce email + product. Attribue
  // l'order au cart source pour le funnel sent → clicked → recovered.
  // Fail-soft : pas critique pour la commande.
  void (async () => {
    try {
      const recentlyClickedCart = await prisma.abandonedCart.findFirst({
        where: {
          email: payload.contact.email.toLowerCase(),
          productId: payload.items[0]?.productId,
          recoveryClickedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { recoveryClickedAt: 'desc' },
        select: { id: true },
      });
      if (recentlyClickedCart) {
        await prisma.order.update({
          where: { id: newOrder.id },
          data: { recoveredFromCartId: recentlyClickedCart.id },
        });
      }
    } catch {
      // Silent — analytics nice-to-have, ne doit pas bloquer ni alerter
    }
  })();

  // Phase 5b : best-effort link au DesignDraft si le user vient de l'éditeur.
  // Ne fail PAS la commande si le link ne marche pas (designId invalide,
  // déjà lié à un autre order, etc.) — c'est de l'analytics, pas critique.
  //
  // Audit v2 #5.3 — ownership guard : `update({ where:{ id } })` permettait de
  // rattacher le draft d'un AUTRE user (id deviné/fuité) à sa propre commande.
  // `updateMany` gardé sur { userId, orderId:null } (comme designs/finalize)
  // empêche le cross-user link + le re-link d'un draft déjà attaché.
  if (payload.designId) {
    try {
      await prisma.designDraft.updateMany({
        where: { id: payload.designId, userId, orderId: null },
        data: { orderId: newOrder.id },
      });
    } catch (err) {
      console.warn(
        `[orders/create] could not link designDraft ${payload.designId} to order ${newOrder.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Round 30 #1 — describe reseller discount pour rendering propre côté UI
  // (label "Reseller perks (-5 %)" + montant). null si pas VERIFIED.
  const { describeResellerDiscount } = await import('@/lib/reseller/perks');
  const resellerDescriptor = describeResellerDiscount(
    Math.round(subtotal * 100),
    userResellerStatus,
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    breakdown: {
      subtotal,
      discount: discountAmount,
      promoCode: promoRecord?.code ?? null,
      // Round 30 #1 — reseller discount exposé dans la breakdown pour que
      // /order/review puisse afficher la ligne "Reseller perks (-5 %)".
      // Avant : silencieusement déduit côté Stripe sans affichage → resellers
      // emailaient le support pour comprendre l'écart entre subtotal+tax+ship
      // et leur charge réelle.
      resellerDiscount: resellerDescriptor?.amountCents ? resellerDescriptor.amountCents / 100 : 0,
      resellerDiscountLabel: resellerDescriptor?.label ?? null,
      shipping: effectiveShippingPrice,
      originalShipping: payload.shippingPrice,
      tax: tax.total,
      taxLines: tax.lines,
      // Round 30 #1 — wallet + referral credits exposés. Avant : le serveur
      // déduisait dans `totalCents` (Stripe amount) mais le client voyait
      // total = subtotal+tax+ship → le bouton "Confirmer 150 $" et Stripe
      // débitait 80 $. Trust-breaking. Maintenant la ligne apparaît avec
      // le crédit appliqué (négatif) et `total` = charge Stripe réelle.
      walletCredit: walletCreditApplied / 100,
      referralCredit: referralCreditApplied / 100,
      // total = ce que Stripe va effectivement débiter (totalCents / 100).
      total: totalCents / 100,
      grossTotal: grossTotalCents / 100,
      currency: 'CAD',
      // Perks appliqués automatiquement côté serveur (Round 13 #5).
      // Le client peut s'en servir pour afficher un toast/badge "🥇 Livraison
      // offerte avec ton statut OR" sans avoir à re-fetch user.
      perks: {
        goldFreeShipping: goldFreeShippingApplied,
        loyaltyTier: userLoyaltyTier,
      },
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
    // Round 26 #2 — préfixer les instructions de livraison customer dans
    // le champ `notes` (seul champ libre disponible dans SinaliteOrderRequest).
    // Le transporteur les voit via le bon de livraison Sinalite.
    ...buildSinaliteNotes(p.shippingNote, p.notes),
  };
}

/** Round 26 #2 — combine note customer livraison + notes générales. */
function buildSinaliteNotes(shippingNote: string | undefined, notes: string | undefined): { notes?: string } {
  const parts: string[] = [];
  if (shippingNote) parts.push(`Livraison: ${shippingNote}`);
  if (notes) parts.push(notes);
  if (parts.length === 0) return {};
  return { notes: parts.join('\n').slice(0, 500) };
}
