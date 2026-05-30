/**
 * Next.js instrumentation hook — runs once at server start (Node + Edge).
 *
 * Bootstraps Sentry pour catch les exceptions non-handled dans :
 *   - Server Components
 *   - API routes
 *   - Middleware (Edge)
 *   - Webhooks
 *
 * No-op si SENTRY_DSN n'est pas configuré (dev local, ou si on veut
 * désactiver temporairement le tracking en prod).
 */

import * as Sentry from '@sentry/nextjs';
import { routeSentryEvent } from '@/lib/sentry/routing';

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NODE_ENV ?? 'development';
const SAMPLE_RATE = ENV === 'production' ? 0.1 : 1.0;

export async function register() {
  // Round 38 #5 — Vérif des critical env vars au boot.
  // Round 42b (incident prod 2026-05-30) — log-only, NE JAMAIS throw ici.
  //
  // Avant : `if (production) throw err` faisait crasher le hook
  // d'instrumentation Next.js → "Failed to prepare server" → 500 sur 100%
  // du site, pour UNE SEULE env var manquante. Un bug regex amplify.yml a
  // vidé .env.production (les vars étaient pourtant bien configurées dans
  // la console Amplify) et a mis tout plio.ca hors-ligne.
  //
  // Désormais : on log fort (visible Sentry + CloudWatch) mais on laisse le
  // serveur démarrer. Une var manquante dégrade la feature qui l'utilise
  // (chaque module fait déjà son propre check → 503 ciblé), jamais le site
  // entier. Fail-soft au lieu de fail-hard total.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { assertProductionEnvReady } = await import('@/lib/env');
      assertProductionEnvReady();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        '[boot] env validation failed (server starts anyway; features needing the missing vars will 503):',
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (!DSN) {
    console.log('[sentry] DSN not set, skipping (set SENTRY_DSN to enable)');
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      tracesSampleRate: SAMPLE_RATE,
      profilesSampleRate: SAMPLE_RATE,
      beforeSend(event, hint) {
        // 1. Strip Plio sensitive data
        if (event.request?.cookies) delete event.request.cookies;
        if (event.request?.headers) {
          delete event.request.headers['cookie'];
          delete event.request.headers['stripe-signature'];
          delete event.request.headers['authorization'];
        }
        // 2. Apply alert routing : drop noise, tag severity, mute warnings
        return routeSentryEvent(event, hint);
      },
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      tracesSampleRate: SAMPLE_RATE,
      beforeSend(event, hint) {
        return routeSentryEvent(event, hint);
      },
    });
  }
}

// Required for Next.js 15+ to capture errors in Server Components / Server Actions
export const onRequestError = Sentry.captureRequestError;
