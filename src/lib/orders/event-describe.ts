/**
 * Pure helpers pour parser le payload JSON d'un OrderEvent en texte
 * human-readable. Extrait dans son propre fichier pour être testable
 * sans JSX (cf. tests/order-event-describe.test.ts).
 */

import type { OrderEventKind } from '@/lib/db/orders';
import { extractSinaliteStatus } from './timeline';

export interface DescribableEvent {
  kind: string;
  data: string | null;
}

/**
 * Retourne une description humaine du payload selon le kind. NULL si
 * pas de payload ou rien d'intéressant à montrer.
 */
export function describeEvent(event: DescribableEvent): string | null {
  if (!event.data) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(event.data) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (event.kind === 'SINALITE_STATUS_CHANGED') {
    const status = extractSinaliteStatus(event.data);
    const tracking = parsed.trackingNumber as string | undefined;
    const carrier = parsed.carrier as string | undefined;
    const parts: string[] = [];
    if (status) parts.push(`Statut : ${status}`);
    if (tracking) parts.push(`Tracking : ${carrier ?? 'Carrier'} ${tracking}`);
    return parts.join(' · ') || null;
  }

  if (event.kind === 'REFUND_ISSUED') {
    const cents = parsed.amountCents as number | undefined;
    const reason = parsed.reason as string | undefined;
    const parts: string[] = [];
    if (typeof cents === 'number') parts.push(`Montant : ${(cents / 100).toFixed(2)} $ CAD`);
    if (reason) parts.push(`Raison : ${reason}`);
    return parts.join(' · ') || null;
  }

  if (event.kind === 'PAYMENT_FAILED') {
    const reason = parsed.failureMessage as string | undefined ?? parsed.reason as string | undefined;
    return reason ? `Raison : ${reason}` : null;
  }

  if (event.kind === 'SINALITE_SUBMITTED') {
    const id = parsed.sinaliteOrderId as string | undefined;
    return id ? `Numéro presse : ${id}` : null;
  }

  if (event.kind === 'ERROR') {
    const message = parsed.message as string | undefined ?? parsed.error as string | undefined;
    return message ?? null;
  }

  return null;
}

export const KIND_LABELS: Record<OrderEventKind, string> = {
  PAYMENT_SUCCEEDED: 'Paiement confirmé',
  PAYMENT_FAILED: 'Paiement échoué',
  SINALITE_SUBMITTED: 'Soumise à la presse',
  SINALITE_STATUS_CHANGED: 'Statut presse',
  REFUND_ISSUED: 'Remboursement émis',
  ERROR: 'Erreur',
};
