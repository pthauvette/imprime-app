/**
 * priceOrder — calcul de prix serveur d'une commande, EXTRAIT de
 * /api/orders/create (move fidèle, behavior-preserving). Partagé par le checkout
 * web ET (à venir) le MCP create_order Mode B, pour garantir devis == checkout ==
 * MCP (un seul chemin de prix → pas de divergence).
 *
 * L'appelant fournit ce qui dépend de la requête/session (items résolus, prefs
 * user déjà chargées, orderCount pour firstOrderOnly, sig de livraison). priceOrder
 * fait : subtotal (lookupVariant + fallback Sinalite + markup admin) avec gardes
 * (PRODUCT_DISABLED/OPTION_HIDDEN/PRICE_FETCH_FAILED), anti-tamper expectedSubtotal,
 * promo (lookup + re-validation), vérif sig de livraison (log + enforce), perks
 * GOLD, reseller, taxe, crédits wallet→referral. La séquence + l'arithmétique +
 * la précédence d'erreurs sont IDENTIQUES à l'original.
 */
import { sinalite } from '@/lib/sinalite/client';
import { prisma } from '@/lib/db';
import { computeTax } from '@/lib/taxes';
import { applyShippingPerks } from '@/lib/customers/perks';
import { verifyShippingQuoteToken } from '@/lib/shipping/quote-token';
import { normalizeCode, validatePromo } from '@/lib/promo/validate';
import { log } from '@/lib/logger';

export type ResellerStatus = 'NONE' | 'AUTO_DETECTED' | 'VERIFIED' | 'PLATINUM';

export interface PriceOrderUser {
  loyaltyTier: string | null;
  resellerStatus: ResellerStatus;
  walletCents: number;
  referralCreditCents: number;
  taxExempt: boolean;
}

export interface PriceOrderInput {
  items: { productId: number; optionIds: number[] }[];
  /** Anti-tamper : si fourni, rejette PRICE_MISMATCH si subtotal diverge (> 0.05 $). */
  expectedSubtotal?: number;
  province: string;
  postalCode: string;
  shippingMethod: string;
  shippingPrice: number;
  shippingQuoteSig?: string | null;
  /** ENFORCE_SHIPPING_SIG === '1' côté web ; le caller décide. */
  enforceShippingSig: boolean;
  promoCode?: string | null;
  /** Pour le log de la sig + (le caller a déjà calculé orderCountForUser). */
  contactEmail: string;
  itemCount: number;
  /** Prefs déjà chargées (null = guest). Jamais trust le payload : source = DB user. */
  user: PriceOrderUser | null;
  /** Commandes honorées du user (notIn PENDING/FAILED/CANCELLED) — pour firstOrderOnly. */
  orderCountForUser: number;
}

type DetailCache = Map<number, Awaited<ReturnType<typeof sinalite.getProductDetail>>>;

export interface PriceOrderResult {
  ok: true;
  /** dollars */ subtotal: number;
  /** dollars */ discountAmount: number;
  /** dollars */ resellerDiscountAmount: number;
  /** dollars */ effectiveShippingPrice: number;
  goldFreeShippingApplied: boolean;
  tax: { lines: { label: string; rate: number; amount: number }[]; total: number; combinedRate: number };
  grossTotalCents: number;
  walletCreditApplied: number;
  referralCreditApplied: number;
  totalCents: number;
  promoRecord: Awaited<ReturnType<typeof prisma.promoCode.findUnique>> | null;
  detailCache: DetailCache;
  productNames: Map<number, string>;
  productSummary: string;
}

export interface PriceOrderError {
  ok: false;
  code: 'PRODUCT_DISABLED' | 'OPTION_HIDDEN' | 'PRICE_FETCH_FAILED' | 'PRICE_MISMATCH' | 'PROMO_INVALID' | 'SHIPPING_QUOTE_INVALID';
  status: number;
  message: string;
  details?: unknown;
}

export async function priceOrder(input: PriceOrderInput): Promise<PriceOrderResult | PriceOrderError> {
  const { lookupVariant } = await import('@/lib/sinalite/pricing');
  const { getEnrichedVariantIndex } = await import('@/lib/products/pricing');
  let subtotal = 0;
  const detailCache: DetailCache = new Map();
  const productNames = new Map<number, string>();
  for (const item of input.items) {
    const { index, marginPct, hiddenOptionIds, disabled } = await getEnrichedVariantIndex(item.productId);

    if (disabled) {
      return { ok: false, code: 'PRODUCT_DISABLED', status: 400, message: "Ce produit n'est plus disponible." };
    }
    if (item.optionIds.some((id) => hiddenOptionIds.has(id))) {
      return { ok: false, code: 'OPTION_HIDDEN', status: 400, message: "Cette configuration n'est pas disponible à la commande." };
    }

    const local = lookupVariant(item.optionIds, index);
    if (local !== null) {
      subtotal += local;
    } else {
      const remote = await sinalite.getPrice(item.productId, item.optionIds);
      const remotePrice = parseFloat(remote.price);
      if (!Number.isFinite(remotePrice) || remotePrice <= 0) {
        return { ok: false, code: 'PRICE_FETCH_FAILED', status: 502, message: "Prix indisponible chez l'imprimeur. Réessaie dans 1 min." };
      }
      const multiplier = marginPct !== null ? 1 + marginPct / 100 : 1;
      subtotal += Math.round(remotePrice * multiplier * 100) / 100;
    }

    if (!detailCache.has(item.productId)) {
      detailCache.set(item.productId, await sinalite.getProductDetail(item.productId));
    }
    if (!productNames.has(item.productId)) {
      const prod = await sinalite.getProduct(item.productId).catch(() => null);
      productNames.set(item.productId, prod?.name ?? 'Produit Plio');
    }
  }

  const productSummary = input.items
    .map((item, idx) => {
      const name = productNames.get(item.productId) ?? `Produit #${item.productId}`;
      return idx === 0 ? name : `+ ${name}`;
    })
    .join(' ');

  if (input.expectedSubtotal !== undefined && Math.abs(subtotal - input.expectedSubtotal) > 0.05) {
    return {
      ok: false,
      code: 'PRICE_MISMATCH',
      status: 409,
      message: 'Le total a changé depuis le devis. Recharge la page.',
      details: { server: subtotal, client: input.expectedSubtotal },
    };
  }

  // Phase 2a: promo (lookup + re-validation serveur).
  let promoRecord: Awaited<ReturnType<typeof prisma.promoCode.findUnique>> | null = null;
  let discountAmount = 0;
  if (input.promoCode) {
    const normalized = normalizeCode(input.promoCode);
    promoRecord = await prisma.promoCode.findUnique({ where: { code: normalized } });
    const r = validatePromo(promoRecord, {
      subtotalCents: Math.round(subtotal * 100),
      orderCountForUser: input.orderCountForUser,
    });
    if (!r.ok) {
      return { ok: false, code: 'PROMO_INVALID', status: 400, message: r.message, details: { failureCode: r.failureCode } };
    }
    discountAmount = r.discountCents / 100;
  }

  const userLoyaltyTier = input.user?.loyaltyTier ?? null;
  const userReferralCreditCents = input.user?.referralCreditCents ?? 0;
  const userWalletCents = input.user?.walletCents ?? 0;
  const userTaxExempt = input.user?.taxExempt ?? false;
  const userResellerStatus: ResellerStatus = input.user?.resellerStatus ?? 'NONE';

  // Round 1 audit — anti-tamper shippingPrice via devis signé. Position IDENTIQUE
  // à l'original (après promo, avant perks). log-only par défaut ; 409 si enforce.
  {
    const sigValid = verifyShippingQuoteToken(
      {
        method: input.shippingMethod,
        price: input.shippingPrice,
        country: 'CA',
        province: input.province,
        postal: input.postalCode,
        productIds: input.items.map((i) => i.productId),
      },
      input.shippingQuoteSig,
    );
    if (!sigValid) {
      log.warn(
        {
          shippingMethod: input.shippingMethod,
          shippingPrice: input.shippingPrice,
          province: input.province,
          hasSig: !!input.shippingQuoteSig,
          itemCount: input.itemCount,
          email: input.contactEmail,
          enforced: input.enforceShippingSig,
        },
        input.enforceShippingSig
          ? 'orders/create: devis de livraison non signé/invalide (REJETÉ 409)'
          : 'orders/create: devis de livraison non signé/invalide (log-only)',
      );
      if (input.enforceShippingSig) {
        return {
          ok: false,
          code: 'SHIPPING_QUOTE_INVALID',
          status: 409,
          message: 'Le devis de livraison a expiré ou changé. Recharge la page de livraison pour obtenir un nouveau prix.',
        };
      }
    }
  }

  const perks = applyShippingPerks({ tier: userLoyaltyTier, shippingPrice: input.shippingPrice });
  const effectiveShippingPrice = perks.effectiveShippingPrice;
  const goldFreeShippingApplied = perks.goldFreeShipping;

  const { computeResellerDiscount } = await import('@/lib/reseller/perks');
  const resellerDiscountAmount = computeResellerDiscount(Math.round(subtotal * 100), userResellerStatus) / 100;

  const taxableSubtotal = Math.max(0, subtotal - discountAmount - resellerDiscountAmount + effectiveShippingPrice);
  const tax = userTaxExempt
    ? { lines: [], total: 0, combinedRate: 0 }
    : computeTax(taxableSubtotal, input.province as Parameters<typeof computeTax>[1]);
  const grossTotalCents = Math.round((taxableSubtotal + tax.total) * 100);

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

  return {
    ok: true,
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
  };
}
