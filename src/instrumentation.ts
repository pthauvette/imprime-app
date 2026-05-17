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

const DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NODE_ENV ?? 'development';
const SAMPLE_RATE = ENV === 'production' ? 0.1 : 1.0;

export async function register() {
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
      // Don't send Plio sensitive data
      beforeSend(event) {
        // Strip auth cookies + Stripe webhook signatures
        if (event.request?.cookies) delete event.request.cookies;
        if (event.request?.headers) {
          delete event.request.headers['cookie'];
          delete event.request.headers['stripe-signature'];
          delete event.request.headers['authorization'];
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      tracesSampleRate: SAMPLE_RATE,
    });
  }
}

// Required for Next.js 15+ to capture errors in Server Components / Server Actions
export const onRequestError = Sentry.captureRequestError;
