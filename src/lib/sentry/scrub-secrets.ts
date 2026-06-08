/**
 * Scrub des clés API Plio (`plio_sk_…`) dans les événements Sentry.
 *
 * Défense en profondeur : le token en clair ne devrait JAMAIS arriver jusqu'ici
 * (jamais mis dans AuthInfo, header `authorization` déjà supprimé en beforeSend,
 * jamais loggé par le code). Mais Sentry capture un contexte large (breadcrumbs,
 * `extra`, messages d'exception, valeurs sérialisées) où un secret pourrait fuir
 * par inadvertance. On le neutralise partout, récursivement, avant l'envoi.
 *
 * Le pattern préfixe (plio_sk_live_/plio_sk_test_) est reconnaissable et stable.
 */
const API_KEY_RE = /plio_sk_(?:live|test)_[A-Za-z0-9_-]{6,}/g;

/** Remplace toute clé API dans une string par un marqueur non sensible. */
export function scrubSecretString(s: string): string {
  return s.replace(API_KEY_RE, 'plio_sk_[REDACTED]');
}

/**
 * Scrub récursif en place (profondeur bornée, anti-cycle). Mute l'objet — OK pour
 * un event Sentry qui nous appartient au moment du beforeSend.
 */
function scrubDeep(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') return scrubSecretString(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value; // anti-cycle
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrubDeep(value[i], depth + 1, seen);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) obj[k] = scrubDeep(obj[k], depth + 1, seen);
  return obj;
}

/** Scrub les clés API d'un event (ou tout objet). Idempotent. */
export function scrubApiKeysDeep<T>(event: T): T {
  return scrubDeep(event, 0, new WeakSet<object>()) as T;
}
