/**
 * Logger structuré (Pino) — remplace les `console.log/error` partout.
 *
 * Pourquoi Pino plutôt que console :
 *   - JSON structuré → CloudWatch Insights peut filtrer/aggréger
 *   - Niveaux (debug/info/warn/error/fatal) avec filter au runtime via
 *     LOG_LEVEL env var (default 'info')
 *   - Child loggers : `log.child({ component: 'stripe' })` ajoute le tag
 *     à toutes les lines de ce logger
 *   - Sentry integration : on attache un beforeSend pour push les errors
 *     vers Sentry automatiquement (via instrumentation.ts)
 *   - Fast : ~5x plus rapide que console.log JSON.stringify (Pino utilise
 *     un fast JSON writer)
 *
 * Usage :
 *   import { log } from '@/lib/logger';
 *   log.info({ orderId: '...' }, 'order created');
 *   log.error({ err, intentId }, 'sinalite createOrder failed');
 */

import pino from 'pino';

const LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Chemins censurés dans TOUS les logs (Pino redact, fast-redact syntax).
 *
 * Revue privacy Loi 25 / LPRPDE — la journalisation envoie du JSON vers
 * CloudWatch ; un courriel/téléphone client en clair y serait queryable et
 * constituerait une collecte non minimisée. Plusieurs routes logguent `email`
 * (au niveau racine) — newsletter, contact, suppression, broadcast, orders/create.
 * On censure CENTRALEMENT plutôt que par site d'appel : couvre l'existant ET tout
 * futur log, sans rustines à maintenir. Les clés distinctes (ex. `adminEmail` du
 * personnel) ne sont PAS touchées — utile au débogage des notifs.
 *
 * Exporté pour être testable (tests/logger-redaction.test.ts).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["stripe-signature"]',
  'password',
  'secret',
  'token',
  '*.password',
  '*.secret',
  '*.token',
  // PII client (Loi 25) — niveau racine + un niveau d'imbrication.
  'email',
  '*.email',
  'phone',
  '*.phone',
];

// En prod : JSON brut pour CloudWatch / Sentry
// En dev : pretty-printed via pino-pretty si dispo, sinon JSON
const isDev = process.env.NODE_ENV !== 'production';

export const log = pino({
  level: LEVEL,
  // Pino sérialise les erreurs proprement par défaut, mais on ajoute
  // explicitement pour les contexts custom
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  // Ne logge PAS les fields sensibles par défaut (custom redact)
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  // Pretty-print en dev pour lisibilité, JSON brut en prod
  ...(isDev
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 }, // stdout, pas de pino-pretty pour éviter dep optionnelle
        },
      }
    : {}),
});

/**
 * Loggers tagués par domaine pour faire grep/filter facile.
 * Usage : `import { logStripe } from '@/lib/logger'; logStripe.info('...');`
 */
export const logStripe = log.child({ component: 'stripe' });
export const logSinalite = log.child({ component: 'sinalite' });
export const logAuth = log.child({ component: 'auth' });
export const logEmail = log.child({ component: 'email' });
export const logS3 = log.child({ component: 's3' });
export const logAdmin = log.child({ component: 'admin' });
export const logWebhook = log.child({ component: 'webhook' });
