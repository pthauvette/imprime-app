/**
 * Validation + application des promo codes.
 *
 * Pure function (testable sans DB) qui prend le code DB + le contexte
 * (subtotal, orderCountForUser) et retourne soit OK avec le montant
 * remisé en cents, soit ERROR avec un message FR pour l'UI.
 *
 * Discount calc :
 *   - discountPct : Math.round(subtotalCents * pct / 100)
 *   - discountCents : capped to subtotalCents (jamais négatif)
 *
 * Le serveur DOIT re-valider à la création de l'Order — le client peut
 * trafiquer son call à /api/promo/validate mais /api/orders/create
 * re-passe par le même validateur.
 */

import type { PromoCode } from '@prisma/client';

export type ValidationFailureCode =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'MAX_USES_REACHED'
  | 'MIN_SUBTOTAL_NOT_MET'
  | 'FIRST_ORDER_ONLY'
  | 'INVALID_DISCOUNT_CONFIG';

export type ValidationResult =
  | {
      ok: true;
      discountCents: number;
      code: string;
      label: string | null;
      /** Sentence FR pour confirmer à l'user. */
      message: string;
    }
  | {
      ok: false;
      failureCode: ValidationFailureCode;
      /** Sentence FR pour afficher à l'user. */
      message: string;
    };

export interface ValidationContext {
  /** Subtotal AVANT discount et avant taxes/shipping. En cents. */
  subtotalCents: number;
  /** Combien de commandes ce user a déjà passées (status non-PENDING). */
  orderCountForUser: number;
  /** now() pour pouvoir mocker dans les tests. Default Date.now(). */
  now?: Date;
}

/** Normalise un code utilisateur — upper + trim. Pour lookup DB. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export function validatePromo(
  promo: PromoCode | null,
  ctx: ValidationContext,
): ValidationResult {
  if (!promo) {
    return {
      ok: false,
      failureCode: 'NOT_FOUND',
      message: 'Code promo invalide.',
    };
  }

  if (!promo.active) {
    return {
      ok: false,
      failureCode: 'INACTIVE',
      message: 'Ce code promo n\'est plus actif.',
    };
  }

  const now = ctx.now ?? new Date();
  if (promo.expiresAt && promo.expiresAt < now) {
    return {
      ok: false,
      failureCode: 'EXPIRED',
      message: `Ce code promo a expiré le ${promo.expiresAt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}.`,
    };
  }

  if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
    return {
      ok: false,
      failureCode: 'MAX_USES_REACHED',
      message: 'Ce code promo a atteint son nombre maximum d\'utilisations.',
    };
  }

  if (promo.minSubtotalCents !== null && ctx.subtotalCents < promo.minSubtotalCents) {
    return {
      ok: false,
      failureCode: 'MIN_SUBTOTAL_NOT_MET',
      message: `Ce code promo requiert un sous-total minimum de ${formatCad(promo.minSubtotalCents)}.`,
    };
  }

  if (promo.firstOrderOnly && ctx.orderCountForUser > 0) {
    return {
      ok: false,
      failureCode: 'FIRST_ORDER_ONLY',
      message: 'Ce code promo est réservé aux nouveaux clients.',
    };
  }

  // Validate discount config — exactement un des deux doit être set
  const hasPct = promo.discountPct !== null && promo.discountPct > 0;
  const hasCents = promo.discountCents !== null && promo.discountCents > 0;
  if (hasPct === hasCents) {
    return {
      ok: false,
      failureCode: 'INVALID_DISCOUNT_CONFIG',
      message: 'Configuration du code invalide (contacte le support).',
    };
  }

  let discountCents: number;
  let humanDiscount: string;
  if (hasPct) {
    discountCents = Math.round(ctx.subtotalCents * promo.discountPct! / 100);
    humanDiscount = `${promo.discountPct} % de rabais`;
  } else {
    discountCents = promo.discountCents!;
    humanDiscount = `${formatCad(promo.discountCents!)} de rabais`;
  }

  // Cap : jamais plus que le subtotal lui-même
  discountCents = Math.min(discountCents, ctx.subtotalCents);

  return {
    ok: true,
    discountCents,
    code: promo.code,
    label: promo.label,
    message: `${humanDiscount} appliqué (${formatCad(discountCents)}).`,
  };
}

function formatCad(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',') + ' $';
}
