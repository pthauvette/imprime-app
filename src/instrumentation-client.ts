/**
 * Sentry client-side init — runs in browser.
 *
 * Pour les errors qui happen côté client (React errors, browser API failures,
 * etc.). Use NEXT_PUBLIC_SENTRY_DSN env var (publishable, visible côté browser).
 */

import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const ENV = process.env.NODE_ENV ?? 'development';

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,
    // Replay on errors only (low storage cost)
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    // Strip sensitive data from breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'fetch' && breadcrumb.data?.url) {
        const url = String(breadcrumb.data.url);
        if (url.includes('/api/auth/') || url.includes('/api/uploads/')) {
          // Don't capture auth/upload bodies (may contain emails, file content)
          delete breadcrumb.data.request_body;
        }
      }
      return breadcrumb;
    },
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
