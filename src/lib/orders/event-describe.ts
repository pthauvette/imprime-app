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
    // Tolère l'ancien format imbriqué `{payload:{...}}` (cf. extractSinaliteStatus).
    const legacyPayload = parsed.payload as Record<string, unknown> | undefined;
    const tracking = (parsed.trackingNumber ?? legacyPayload?.trackingNumber) as string | undefined;
    const carrier = (parsed.carrier ?? legacyPayload?.carrier) as string | undefined;
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
    // `reason` inclus : `markOrderFailed` le persiste désormais dans l'event,
    // parce que `failureReason` sur la commande est ÉCRASÉ à chaque échec —
    // et la transition FAILED→FAILED est maintenant permise, donc un second
    // échec transitoire remplacerait la cause racine utile.
    //
    // La page admin rend déjà le JSON brut de l'event, donc la cause était
    // lisible ; ici c'est le RÉSUMÉ de la timeline qui la montre enfin.
    // Aucune fuite : les events ERROR ne sont rendus que si `showErrors`,
    // réservé à l'admin (finding [50] non rouvert).
    const message =
      (parsed.message as string | undefined) ??
      (parsed.error as string | undefined) ??
      (parsed.reason as string | undefined);
    return message ?? null;
  }

  if (event.kind === 'REFUND_FAILED') {
    // Le montant compte autant que la cause : c'est ce que le client attend
    // toujours, et ce que Plio détient sans le savoir.
    const cents = parsed.amountCents as number | undefined;
    const raison = parsed.raison as string | undefined;
    const parts: string[] = [];
    if (typeof cents === 'number') parts.push(`Montant NON rendu : ${(cents / 100).toFixed(2)} $ CAD`);
    if (raison) parts.push(`Cause : ${raison}`);
    return parts.join(' · ') || null;
  }

  if (event.kind === 'PAYMENT_DISPUTED') {
    const cents = parsed.amountCents as number | undefined;
    const raison = parsed.raison as string | undefined;
    const parts: string[] = [];
    if (typeof cents === 'number') parts.push(`Montant contesté : ${(cents / 100).toFixed(2)} $ CAD`);
    if (raison) parts.push(`Motif : ${raison}`);
    return parts.join(' · ') || null;
  }

  if (event.kind === 'CANCEL_REQUESTED') {
    const reason = parsed.reason as string | undefined;
    return reason ? `Raison : ${reason}` : null;
  }

  if (event.kind === 'MANUAL_ORDER_CREATED') {
    const quoteId = parsed.quoteId as string | undefined;
    return quoteId ? `Devis : #${quoteId.slice(-6).toUpperCase()}` : null;
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
  CANCEL_REQUESTED: 'Annulation demandée',
  MANUAL_ORDER_CREATED: 'Commande créée depuis un devis sur mesure',
  SINALITE_SUBMIT_UNCERTAIN: 'Soumission partie sans réponse',
  SINALITE_SUBMIT_UNCERTAIN_CLEARED: 'Incertitude levée par un admin',
  REFUND_FAILED: 'Remboursement ÉCHOUÉ — argent revenu chez Plio',
  PAYMENT_DISPUTED: 'Paiement contesté auprès de la banque',
};
