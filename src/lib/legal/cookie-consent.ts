/**
 * Cookie consent helpers — pures, sans DOM, sans React.
 *
 * Round 26 #1. Extraits du composant CookieConsent.tsx pour :
 *   - tester la logique sans bootstrap React (vitest stay node-env)
 *   - permettre une réutilisation server-side dans le futur si on lit
 *     le cookie en SSR pour skip le banner au paint initial
 *   - éviter le drift d'invariants (le composant + un éventuel
 *     resetButton parlent du même cookie via les mêmes helpers)
 *
 * Politique : Plio ne set QUE des cookies strictly necessary (session,
 * cart, lang, referral_ref). Ce cookie 'plio_consent' est l'acknowledgement
 * du user qu'il a vu le banner — pas un opt-in tracking.
 */

export const CONSENT_COOKIE = 'plio_consent';
export const CONSENT_VALUE = 'ok';
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 an

/**
 * Détecte si le cookie consent est présent dans un cookie header.
 * Accepte soit document.cookie (côté client) soit le header HTTP
 * `Cookie:` (côté serveur).
 */
export function hasConsentCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(';')
    .some((c) => {
      const trimmed = c.trim();
      // Match exactement le nom suivi de '=' pour éviter qu'un cookie
      // 'plio_consent_other=x' matche par préfixe.
      return trimmed.startsWith(`${CONSENT_COOKIE}=`);
    });
}

/**
 * Construit le string Set-Cookie pour persist l'ack du user.
 * SameSite=Lax → safe pour navigation depuis liens externes.
 * Pas de Secure flag explicite : le browser l'ajoutera en https
 * via le contexte, et en dev local on veut que ça marche en http.
 */
export function buildConsentCookie(): string {
  return `${CONSENT_COOKIE}=${CONSENT_VALUE}; path=/; max-age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/**
 * Construit le string Set-Cookie pour expirer le cookie (max-age=0).
 * Utilisé par /settings/privacy → "Réinitialiser" pour faire
 * réapparaître le banner.
 *
 * Décision : on ne touche QUE plio_consent. La session, le cart, et
 * le referral_ref restent intacts — le user ne demande pas un logout,
 * juste de revoir l'info.
 */
export function buildResetConsentCookie(): string {
  return `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}
