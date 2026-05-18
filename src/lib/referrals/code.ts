/**
 * Génération de codes de parrainage user-friendly + lookup helpers.
 *
 * Format : 5-10 chars uppercase alphanumérique, basé sur le firstName/email
 * pour être mémorable (ex: "SOPHIE7H4N", "PATRICK9XYZ"). Si collision DB
 * (rare mais possible), on retry avec une nouvelle suffix.
 *
 * Constants : on commence par 10$ CAD/side, ajustable via env.
 */

import { prisma } from '@/lib/db';

/** Crédit attribué à CHAQUE side (référent + filleul) en cents CAD. */
export const REFERRAL_REWARD_CENTS = Number(process.env.REFERRAL_REWARD_CENTS ?? 1000);

/** Suffixe random (4 chars alphanumériques en majuscules). */
function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I/O/0/1 pour lisibilité
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Prépare un préfixe lisible depuis l'identité user.
 * "Sophie Beauchamp" → "SOPHIE", "sophie.b@plio.ca" → "SOPHIEB"
 * Maxi 7 chars (suffix random = 4) → total ≤ 11.
 */
function preferredPrefix(input: { firstName?: string | null; name?: string | null; email: string }): string {
  const candidate = input.firstName || input.name?.split(' ')[0] || input.email.split('@')[0];
  return (candidate ?? 'PLIO')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7) || 'PLIO';
}

/**
 * Récupère le code de parrainage de l'user, en le générant lazy si pas
 * encore présent. Stratégie unique check + retry (jusqu'à 5 tries) :
 * la chance de collision sur 4 chars × 32 = 1/1M, donc 5 retries couvrent
 * largement les premières milliers d'users.
 *
 * Si tous les retries échouent (jamais en pratique), on throw — le caller
 * doit handler (page /account/referrals affichera un message).
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, referralCode: true, firstName: true, name: true, email: true },
  });
  if (!user) throw new Error(`User ${userId} introuvable`);
  if (user.referralCode) return user.referralCode;

  const prefix = preferredPrefix(user);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${prefix}${randomSuffix()}`;
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: candidate },
      });
      return candidate;
    } catch (err) {
      // P2002 = unique constraint violation : essaie une autre suffix
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        continue;
      }
      throw err;
    }
  }
  throw new Error('Impossible de générer un code de parrainage unique après 5 tentatives');
}

/**
 * Lookup d'un référent par son code, sans révéler son identité au caller.
 * Utilisé à l'inscription (capture du cookie plio_ref) + au paiement
 * pour award le crédit. Retourne null si code invalide / inexistant.
 */
export async function findReferrerByCode(code: string): Promise<{ id: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized || normalized.length < 5 || normalized.length > 20) return null;
  return prisma.user.findUnique({
    where: { referralCode: normalized },
    select: { id: true },
  });
}

/**
 * URL partage publique du programme de parrainage avec le code pré-rempli.
 * Le visitor landing va capturer le param ?ref=CODE en cookie.
 */
export function buildShareUrl(code: string, base: string = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca'): string {
  return `${base}?ref=${encodeURIComponent(code)}`;
}
