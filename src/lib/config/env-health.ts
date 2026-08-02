/**
 * Inspection de la configuration d'environnement AU RUNTIME.
 *
 * POURQUOI (panne 2026-07-20) : les variables posées dans la console Amplify
 * n'atteignent le runtime Lambda que si elles franchissent DEUX filtres — la
 * whitelist `grep` d'`amplify.yml` qui écrit `.env.production`, puis
 * `SERVER_ENV_KEYS` de `next.config.ts`. Une clé absente d'un des deux est
 * simplement `undefined` au runtime, SANS ERREUR : l'opérateur la voit dans la
 * console et croit l'avoir configurée. Le diagnostic a pris des heures.
 *
 * `tests/amplify-env-quoting.test.ts` verrouille déjà la cohérence des deux
 * listes au BUILD. Cette inspection-ci est complémentaire et répond à l'autre
 * question : la variable est-elle réellement ARRIVÉE dans ce conteneur ? Un
 * test prouve qu'elle PEUT passer ; seul le runtime prouve qu'elle EST passée.
 *
 * ⚠️ AUCUNE VALEUR N'EST LUE NI RETOURNÉE — uniquement la présence. Le
 * consommateur (`/api/health`) est un endpoint PUBLIC : les noms eux-mêmes vont
 * aux logs (privés), jamais dans la réponse HTTP.
 */

/**
 * Variables dont l'absence CASSE l'application. Volontairement restreint à ce
 * qui est indispensable partout : une clé utilisée par un seul chemin annexe
 * ferait crier le monitoring pour une panne partielle, et le bruit tue l'alerte.
 */
const REQUIRED = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'SINALITE_CLIENT_ID',
  'SINALITE_CLIENT_SECRET',
  'SINALITE_API_BASE',
  'SINALITE_AUTH_BASE',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SES_SMTP_USER',
  'SES_SMTP_PASS',
  'SES_FROM',
  'CRON_SECRET',
  // Plancher de marge (#462) : sans elle, le catalogue REFUSE de coter en
  // production (fail-closed voulu) — panne visible, mais dont la cause ne l'est
  // pas. C'est précisément la variable qui a motivé cette inspection.
  'DEFAULT_MARGIN_PCT',
] as const;

/**
 * Garde-fous dont l'absence n'est PAS une erreur : ce sont des interrupteurs de
 * déploiement (rollout off → log → enforce). On les rapporte pour rendre
 * visible ce qui est silencieusement inactif, sans jamais faire échouer le
 * check — sinon un rollout délibéré ressemblerait à une panne.
 */
const GUARDS = [
  'ENFORCE_SHIPPING_SIG',
  'FILE_REVALIDATION',
  'SINALITE_WEBHOOK_SECRET',
  // Rate-limit fail-open : sans Upstash, TOUTES les bornes laissent passer.
  // Voir src/lib/ratelimit.ts — c'est un choix assumé sur les chemins de revenu,
  // mais qui doit rester visible plutôt que de se découvrir pendant un abus.
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  // Connexion par SMS (Twilio Verify). Absentes = fonctionnalité inerte, ce
  // qui est un état PARFAITEMENT valide : le lien magique reste le chemin
  // principal. On les rapporte pour que « le texto ne s'affiche pas » ait une
  // cause lisible dans les logs plutôt que de ressembler à un bug d'UI.
  'SMS_AUTH',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
] as const;

/** Variables Twilio nécessaires DÈS QUE `SMS_AUTH=ON`. */
const TWILIO_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
] as const;

export interface EnvConfigReport {
  /** Noms des variables requises absentes — POUR LES LOGS, jamais pour une réponse HTTP publique. */
  missingRequired: string[];
  /** Noms des garde-fous inactifs — informatif, n'entraîne jamais d'échec. */
  guardsInactive: string[];
  /**
   * Variables Twilio manquantes ALORS QUE `SMS_AUTH=ON`.
   *
   * Distinct de `guardsInactive` parce que le sens est opposé : « absentes »
   * est un état voulu, « demandées mais incomplètes » est une ERREUR de
   * configuration. Or elle est silencieuse — `smsAuthDisponible()` renvoie
   * false, la fonctionnalité reste éteinte, et l'admin qui vient de poser
   * `SMS_AUTH=ON` croit l'avoir activée. Sans ce signal, le seul symptôme est
   * « l'onglet texto n'apparaît pas », qu'on ira chercher dans l'UI.
   */
  smsIncomplet: string[];
  /** true seulement si une variable REQUISE manque ET qu'on tourne en production. */
  failing: boolean;
}

/** Une variable posée mais vide (`FOO=`) est traitée comme absente : c'est le
 *  même symptôme au runtime, et c'est un mode d'échec réel du pipeline `sed`. */
function isSet(name: string): boolean {
  return (process.env[name] ?? '').trim().length > 0;
}

export function inspectEnvConfig(): EnvConfigReport {
  const missingRequired = REQUIRED.filter((k) => !isSet(k));
  const guardsInactive = GUARDS.filter((k) => !isSet(k));

  // Hors production, l'absence est NORMALE (dev local, CI) : on rapporte sans
  // échouer, pour que le check reste exerçable par les tests et en dev.
  const failing = missingRequired.length > 0 && process.env.NODE_ENV === 'production';

  // Ne se déclenche QUE si l'activation a été demandée : sans `SMS_AUTH=ON`,
  // des variables Twilio absentes sont l'état normal, pas une incohérence.
  const smsIncomplet = isSet('SMS_AUTH') ? TWILIO_KEYS.filter((k) => !isSet(k)) : [];

  return { missingRequired, guardsInactive, smsIncomplet, failing };
}

/** Exposées pour les tests — vérifier que ces listes ne divergent pas des
 *  whitelists de build (`amplify.yml`, `next.config.ts`). */
export const REQUIRED_ENV_KEYS = REQUIRED;
export const GUARD_ENV_KEYS = GUARDS;
