/**
 * Cookie `plio_pending_profile` (sign-up flow) → patch User à appliquer au
 * premier sign-in (auth.ts events.signIn).
 *
 * Audit v3 L6 — extrait ici (depuis le snippet inline d'auth.ts) pour être testé
 * DIRECTEMENT : avant, le test réimplémentait une copie du snippet → un refactor
 * d'auth.ts réintroduisant un opt-in marketing par défaut serait passé 100 % vert.
 *
 * Loi 25 — `emailMarketing` n'est posé QUE sur consentement explicite (=== true).
 * Sinon le champ est omis → le défaut schéma (false) s'applique = opt-out.
 */
import { composeName } from '@/lib/account/profile';

export interface PendingProfilePayload {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  emailMarketing?: boolean;
}

export interface SignupUpdateData {
  firstName?: string;
  lastName?: string;
  name?: string;
  emailMarketing?: boolean;
}

/** Parse le cookie + construit le patch User (champs bornés). Pas de DB. */
export function buildSignupUpdateData(cookieValue: string | undefined | null): SignupUpdateData {
  if (!cookieValue) return {};
  let pending: PendingProfilePayload;
  try {
    pending = JSON.parse(decodeURIComponent(cookieValue)) as PendingProfilePayload;
  } catch {
    return {};
  }
  const updateData: SignupUpdateData = {};
  if (pending.firstName) updateData.firstName = pending.firstName.slice(0, 100);
  if (pending.lastName) updateData.lastName = pending.lastName.slice(0, 100);
  if (pending.firstName || pending.lastName) {
    updateData.name = composeName(pending.firstName, pending.lastName) ?? undefined;
  }
  // companyName est stocké dans Address (pas sur User pour MVP) → ignoré ici.
  // Loi 25 — opt-in AFFIRMATIF : seulement si la case a été explicitement cochée.
  if (pending.emailMarketing === true) updateData.emailMarketing = true;
  return updateData;
}
