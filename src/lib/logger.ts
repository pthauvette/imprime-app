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
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["stripe-signature"]',
      'password',
      'secret',
      'token',
      '*.password',
      '*.secret',
      '*.token',
    ],
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
