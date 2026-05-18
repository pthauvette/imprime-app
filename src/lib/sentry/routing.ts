/**
 * Sentry alert routing — filtre les erreurs avant de les envoyer à Sentry.
 *
 * Pourquoi : la quota Sentry gratuite est limitée (5k events/mois) et
 * notre signal/noise est mauvais sans filtrage. Les noise candidates :
 *   - ZodError validation (= bad user input, pas un bug)
 *   - Rate-limit 429 (= working as intended)
 *   - AbortError (= user cancel, ex navigation away)
 *   - Stripe card_declined (= user issue, déjà loggé via webhook)
 *   - Network timeouts vers Sinalite (= upstream issue, déjà alerté via Slack)
 *
 * Stratégie 3 niveaux :
 *   - 'drop'     : skip entièrement (return null dans beforeSend)
 *   - 'warning'  : envoie avec tag severity=warning + level=warning
 *   - 'critical' : envoie avec tag severity=critical + level=error
 *
 * Les Slack alerts critiques (sendCriticalAlert) restent indépendantes —
 * ce routeur agit seulement sur ce qui arrive à Sentry depuis les
 * exceptions non-handled. Si tu veux qu'une erreur déclenche Slack,
 * call sendCriticalAlert explicitement.
 */

import type { ErrorEvent, EventHint } from '@sentry/nextjs';

export type Severity = 'critical' | 'warning' | 'drop';

interface ClassifyResult {
  severity: Severity;
  /** Catégorie pour faciliter le grouping côté Sentry. */
  category: string;
  /** Raison human-readable (visible dans le tag). */
  reason: string;
}

/**
 * Classifie une erreur. Pure function — facile à tester.
 * On regarde dans l'ordre : type de l'erreur, message, status code,
 * stack hints, et on retombe sur "critical" si on ne reconnait pas.
 */
export function classifyError(error: unknown): ClassifyResult {
  if (!error) {
    return { severity: 'drop', category: 'unknown', reason: 'null error object' };
  }

  // Network abort — souvent un user qui a fermé la page
  if (isErrorWithName(error, 'AbortError')) {
    return { severity: 'drop', category: 'network', reason: 'fetch aborted (user cancel)' };
  }

  // Zod validation = bad input
  if (isErrorWithName(error, 'ZodError')) {
    return { severity: 'drop', category: 'validation', reason: 'zod schema mismatch (user input)' };
  }

  const message = errorMessage(error).toLowerCase();

  // Stripe card_declined / authentication_required — user-side payment issues
  if (message.includes('your card was declined') || message.includes('card_declined')) {
    return { severity: 'warning', category: 'stripe', reason: 'card declined by issuer' };
  }
  if (message.includes('insufficient_funds')) {
    return { severity: 'warning', category: 'stripe', reason: 'insufficient funds' };
  }
  if (message.includes('expired_card')) {
    return { severity: 'warning', category: 'stripe', reason: 'expired card' };
  }
  if (message.includes('authentication_required') || message.includes('3d secure')) {
    return { severity: 'drop', category: 'stripe', reason: '3DS challenge (expected flow)' };
  }

  // Rate limit hits — visible via metrics, no need to flood Sentry
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return { severity: 'drop', category: 'rate-limit', reason: 'rate limit hit (working as intended)' };
  }

  // Auth flow errors — usually user typed wrong email or expired magic link
  if (
    message.includes('verification token not found') ||
    message.includes('expired') && message.includes('token')
  ) {
    return { severity: 'warning', category: 'auth', reason: 'expired/invalid magic link' };
  }

  // Network timeouts to upstream providers — already covered by Slack alerts
  if (
    (message.includes('timeout') || message.includes('etimedout')) &&
    (message.includes('sinalite') || message.includes('ses') || message.includes('stripe'))
  ) {
    return { severity: 'warning', category: 'upstream-timeout', reason: 'upstream provider timeout' };
  }

  // Prisma connection issues — bad config or downtime. Always critical.
  if (
    message.includes("can't reach database") ||
    message.includes('connection refused') ||
    isErrorWithName(error, 'PrismaClientInitializationError')
  ) {
    return { severity: 'critical', category: 'database', reason: 'Prisma connection failure' };
  }

  // OrderNotFoundError — race condition typiquement, on warn pas critical
  if (isErrorWithName(error, 'OrderNotFoundError')) {
    return { severity: 'warning', category: 'order-state', reason: 'order not found at handler time' };
  }

  // Unknown error → default to critical (safer to over-alert than miss bugs).
  // Sentry dedup will group identical stacks, donc une explosion de la même
  // erreur ne consomme qu'un slot quota.
  return { severity: 'critical', category: 'unknown', reason: 'unclassified exception' };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return String(error);
}

function isErrorWithName(error: unknown, name: string): boolean {
  if (error instanceof Error && error.name === name) return true;
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const n = (error as { name: unknown }).name;
    if (typeof n === 'string' && n === name) return true;
  }
  return false;
}

/**
 * beforeSend hook pour Sentry. Applique la classification et :
 *   - 'drop' → return null (Sentry skip)
 *   - 'warning' → mute le level + tag severity=warning
 *   - 'critical' → tag severity=critical (laisse le level original)
 *
 * Toujours préserve event.tags + category pour faciliter le filtrage
 * dans le dashboard.
 */
export function routeSentryEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  const error = hint.originalException;
  const classification = classifyError(error);

  if (classification.severity === 'drop') {
    return null;
  }

  event.tags = {
    ...event.tags,
    severity: classification.severity,
    category: classification.category,
    classification_reason: classification.reason,
  };

  if (classification.severity === 'warning') {
    event.level = 'warning';
  }

  return event;
}
