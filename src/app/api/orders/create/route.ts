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
import { applyShippingPerks } from '@/lib/customers/perks';
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
      // Round 30 #1 — guard NaN : si Sinalite renvoie un string non numérique
      // ou price absent, parseFloat = NaN, et Math.abs(NaN - x) > 0.05 = false
      // donc le check anti-tamper passe silencieusement → Stripe reçoit
      // amount: NaN et throw une erreur opaque. Fail fast avec un 502 propre.
      if (!Number.isFinite(remotePrice) || remotePrice <= 0) {
        return NextResponse.json(
          { error: 'Prix indisponible chez l\'imprimeur. Réessaie dans 1 min.', code: 'PRICE_FETCH_FAILED' },
          { status: 502 },
        );
      }
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

  // Phase 2b-pre: loyalty GOLD perk = livraison gratuite (Round 13 #5).
  // Lookup session ici en avance pour pouvoir applique le perk AVANT
  // taxe (sinon le user paie la taxe sur du shipping qu'on ne facture pas).
  // Source de vérité = DB user.loyaltyTier (jamais trust le payload client).
  const earlySession = await auth();
  let userLoyaltyTier: string | null = null;
  let userReferralCreditCents = 0;
  let userWalletCents = 0;
  let userTaxExempt = false;
  let userTaxExemptCertId: string | null = null;
  // Round 33 — Ajout 'PLATINUM' au type union (10 % off vs 5 % VERIFIED).
  let userResellerStatus: 'NONE' | 'AUTO_DETECTED' | 'VERIFIED' | 'PLATINUM' = 'NONE';
  if (earlySession?.user?.id) {
    const userPrefs = await prisma.user.findUnique({
      where: { id: earlySession.user.id },
      // Round 22 #2 — load resellerStatus pour 5% discount auto si VERIFIED
      select: { loyaltyTier: true, referralCreditCents: true, walletCents: true, taxExempt: true, taxExemptCertId: true, resellerStatus: true },
    });
    userLoyaltyTier = userPrefs?.loyaltyTier ?? null;
    userReferralCreditCents = userPrefs?.referralCreditCents ?? 0;
    userWalletCents = userPrefs?.walletCents ?? 0;
    userTaxExempt = userPrefs?.taxExempt ?? false;
    userTaxExemptCertId = userPrefs?.taxExemptCertId ?? null;
    userResellerStatus = (userPrefs?.resellerStatus as typeof userResellerStatus) ?? 'NONE';
  }
  const perks = applyShippingPerks({
    tier: userLoyaltyTier,
    shippingPrice: payload.shippingPrice,
  });
  const effectiveShippingPrice = perks.effectiveShippingPrice;
  const goldFreeShippingApplied = perks.goldFreeShipping;

  // Round 22 #2 — Reseller perks : 5% discount auto si user.resellerStatus = VERIFIED.
  // Calculé sur subtotal (pas sur subtotal-discount, pour ne pas double-dip
  // avec PromoCode). Stockable séparément dans Order.resellerDiscountCents
  // pour finance KPIs (vs discountCents = promo). Combine additivement.
  const { computeResellerDiscount } = await import('@/lib/reseller/perks');
  const resellerDiscountAmount = computeResellerDiscount(
    Math.round(subtotal * 100),
    userResellerStatus,
  ) / 100;

  // Phase 2b: tax computation — taxe sur (subtotal - all discounts + shipping)
  // Round 18 #5 — si user.taxExempt, skip tax entièrement. Cert ID archivé
  // dans le User row + snapshot dans sinalitePayload pour audit fiscal.
  const taxableSubtotal = subtotal - discountAmount - resellerDiscountAmount + effectiveShippingPrice;
  const tax = userTaxExempt
    ? { lines: [], total: 0, combinedRate: 0 }
    : computeTax(taxableSubtotal, payload.shippingAddress.province);
  const grossTotalCents = Math.round((taxableSubtotal + tax.total) * 100);

  // Phase 2c: applique les crédits dans l'ordre wallet → referral.
  // Round 20 #3 — Wallet first (le wallet = "argent" déjà payé via topup,
  // referral = bonus marketing). FIFO du plus restrictif au plus flexible.
  // Stripe interdit un PaymentIntent à 0 cents → cap au max grossTotal - 50¢.
  let walletCreditApplied = 0;
  if (userWalletCents > 0) {
    const maxCoverable = Math.max(0, grossTotalCents - 50);
    walletCreditApplied = Math.min(userWalletCents, maxCoverable);
  }
  let referralCreditApplied = 0;
  if (userReferralCreditCents > 0) {
    const remainingMax = Math.max(0, grossTotalCents - walletCreditApplied - 50);
    referralCreditApplied = Math.min(userReferralCreditCents, remainingMax);
  }
  const totalCents = grossTotalCents - walletCreditApplied - referralCreditApplied;

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
      referralCreditApplied: String(referralCreditApplied),
      ...(goldFreeShippingApplied && { goldFreeShipping: 'true' }),
    },
  });

  // Phase 5: persist a PENDING Order row. The Stripe webhook will look it up
  // by paymentIntentId, mark PAID, then submit to Sinalite.
  //
  // Si l'utilisateur est connecté : on attache l'order à son user.id (même
  // s'il a tapé un email contact différent). Sinon : lookup-or-create par
  // email — quand il se créera un compte plus tard avec ce même email,
  // Auth.js PrismaAdapter retombera sur le même User et l'historique sera là.
  // Note : on a déjà fait auth() en Phase 2c (earlySession) — réutilisé ici.
  const user = earlySession?.user
    ? await prisma.user.update({
        where: { id: earlySession.user.id },
        // Si referralCreditApplied > 0, on déduit la balance maintenant. Le
        // PaymentIntent est créé donc l'user est engagé. Si Stripe fail au
        // confirmPayment, on devra refund le crédit dans le webhook
        // payment_failed (TODO future improvement — pour MVP, edge case
        // accepté car rare et le crédit reste sur le compte).
        data: {
          firstName: payload.contact.firstName,
          lastName: payload.contact.lastName,
          phone: payload.contact.phone,
          ...(referralCreditApplied > 0 && {
            referralCreditCents: { decrement: referralCreditApplied },
          }),
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
