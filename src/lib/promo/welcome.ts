/**
 * Code promo de bienvenue (« 25 $ offerts sur ta première commande »).
 *
 * Décision produit : un CODE PROMO plutôt qu'un crédit wallet, parce que :
 *   - minSubtotalCents impose le minimum de commande de 100 $ (impossible sur un
 *     solde wallet fongible) ;
 *   - firstOrderOnly + maxUses:1 le réservent à la 1re commande ;
 *   - discountCents = montant fixe (25 $), pas un pourcentage.
 *
 * N'est accordé QU'aux inscrits via la page promo (cf. auth.ts events.signIn,
 * gardé par le cookie plio_welcome posé par le middleware sur /sign-up).
 *
 * Idempotent : un seul code BIENVENUE par user (dédup sur label welcome:<userId>).
 */
import { prisma } from '@/lib/db';

export const WELCOME_PROMO_DISCOUNT_CENTS = 2500; // 25 $
export const WELCOME_PROMO_MIN_SUBTOTAL_CENTS = 10000; // commande min 100 $

/**
 * Crée (idempotent) le code promo de bienvenue d'un user et retourne le code à
 * afficher dans le welcome email. Retourne le code existant si déjà créé.
 */
export async function grantWelcomePromo(userId: string): Promise<string> {
  const label = `welcome:${userId}`;
  const existing = await prisma.promoCode.findFirst({
    where: { label },
    select: { code: true },
  });
  if (existing) return existing.code;

  // BIENVENUE + 6 chars aléatoires. `code` est @unique : une collision (≈ 1 sur
  // 36^6) ferait throw P2002 — le caller (events.signIn) est best-effort.
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  const code = `BIENVENUE${suffix}`;
  await prisma.promoCode.create({
    data: {
      code,
      label,
      discountCents: WELCOME_PROMO_DISCOUNT_CENTS,
      minSubtotalCents: WELCOME_PROMO_MIN_SUBTOTAL_CENTS,
      maxUses: 1,
      firstOrderOnly: true,
      active: true,
    },
  });
  return code;
}
