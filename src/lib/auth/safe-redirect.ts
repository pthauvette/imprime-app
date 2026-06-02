/**
 * Validation d'un chemin de redirection venant d'un input NON fiable (query
 * param `callbackUrl`). Empêche l'open-redirect : seul un chemin INTERNE relatif
 * est accepté. Tout le reste retombe sur `fallback`.
 *
 * Rejetés :
 *   - URL absolue            : https://evil.com
 *   - protocol-relative      : //evil.com
 *   - scheme déguisé         : javascript:… , data:…
 *   - backslash              : \evil.com  (certains navigateurs le traitent comme //)
 *   - ne commence pas par '/'
 *
 * Note : le `signIn()` de next-auth valide déjà SON callbackUrl (same-origin) ;
 * ce helper protège les `redirect()` SSR faits à la main (ex: user déjà connecté
 * sur /sign-in) qui ne passent PAS par cette validation.
 */
export function safeInternalPath(
  raw: string | undefined | null,
  fallback = '/orders',
): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  try {
    // Résout contre une base bidon : si l'origin résultant diffère, `raw`
    // contenait une cible externe déguisée → rejet.
    const u = new URL(raw, 'https://plio.internal');
    if (u.origin !== 'https://plio.internal') return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
