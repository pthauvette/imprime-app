/**
 * Rectification self-serve du profil (Loi 25 art. 27 — droit de rectification).
 *
 * Normalise + valide les champs éditables (firstName / lastName / phone) et
 * recalcule le `name` composite dénormalisé (lu en fallback à ~10 endroits :
 * admin, recherche, factures). Pur → testable sans auth/prisma ; la Server
 * Action (src/app/settings/profile-actions.ts) ne fait que l'appeler + persister.
 *
 * Le courriel n'est PAS éditable ici : c'est l'identité d'authentification
 * (magic link) — le changer relève d'un autre flux (re-vérification).
 */
import { z } from 'zod';

export const ProfileInputSchema = z.object({
  firstName: z.string().trim().max(100, 'Prénom trop long (max 100 caractères).'),
  lastName: z.string().trim().max(100, 'Nom trop long (max 100 caractères).'),
  phone: z
    .string()
    .trim()
    .max(30, 'Numéro de téléphone trop long (max 30 caractères).')
    .regex(/^[0-9+()\s.\-]*$/, 'Téléphone : chiffres, espaces et + ( ) - . seulement.'),
});

export interface NormalizedProfile {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** Composite dénormalisé, recalculé depuis firstName/lastName. */
  name: string | null;
}

export type ProfileResult =
  | { ok: true; data: NormalizedProfile }
  | { ok: false; error: string };

/**
 * Compose le champ dénormalisé `User.name` depuis firstName/lastName.
 * SOURCE UNIQUE de cette logique — à réutiliser PARTOUT où firstName/lastName
 * changent (rectification profil, guest checkout) pour ne pas laisser `name`
 * périmé (audit v3 L5). Renvoie null si les deux sont vides (→ fallback
 * `[firstName,lastName]` côté lecture).
 */
export function composeName(firstName?: string | null, lastName?: string | null): string | null {
  return [firstName, lastName].filter(Boolean).join(' ').slice(0, 200) || null;
}

/** Valide les champs bruts (FormData) et renvoie le profil normalisé OU une erreur. */
export function normalizeProfileInput(raw: {
  firstName: unknown;
  lastName: unknown;
  phone: unknown;
}): ProfileResult {
  const parsed = ProfileInputSchema.safeParse({
    firstName: String(raw.firstName ?? ''),
    lastName: String(raw.lastName ?? ''),
    phone: String(raw.phone ?? ''),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }
  // Chaîne vide → null (rectification = on autorise à effacer un champ optionnel).
  const firstName = parsed.data.firstName || null;
  const lastName = parsed.data.lastName || null;
  const phone = parsed.data.phone || null;
  const name = composeName(firstName, lastName);
  return { ok: true, data: { firstName, lastName, phone, name } };
}
