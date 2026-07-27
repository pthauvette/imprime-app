/**
 * Helper pour construire une timeline 5 étapes à partir d'un Order + ses
 * OrderEvent. Utilisé par :
 *   - /orders/[id] (page authentifiée — détails complets)
 *   - /track (page publique — verify email puis affiche la même timeline)
 *
 * On extrait ici pour pas dupliquer la logique entre les deux. Les
 * helpers d'extraction (status Sinalite, tracking, ETA) sont publics
 * pour être réutilisés indépendamment si besoin.
 */

import type { OrderEventKind, OrderStatus } from '@/lib/db/orders';
import { formatDate } from '@/lib/format';

export interface TimelineStep {
  label: string;
  description: string;
  done: boolean;
  current: boolean;
  /** Format "YYYY-MM-DD · HH:MM" — null si pas encore atteint. */
  timestamp: string | null;
}

export interface OrderTimelineInput {
  paidAt: Date | null;
  createdAt: Date;
  events: { kind: string; createdAt: Date; data: string | null }[];
}

/** Construit les 5 étapes lifecycle. Robuste à des events manquants. */
export function buildOrderTimeline(
  order: OrderTimelineInput,
  status: OrderStatus,
): TimelineStep[] {
  const eventByKind = new Map<OrderEventKind, Date>();
  for (const e of order.events) {
    if (!eventByKind.has(e.kind as OrderEventKind)) {
      eventByKind.set(e.kind as OrderEventKind, e.createdAt);
    }
  }

  const sinaliteStatuses = order.events
    .filter((e) => e.kind === 'SINALITE_STATUS_CHANGED' && e.data)
    .map((e) => ({ status: extractSinaliteStatus(e.data!), at: e.createdAt }))
    .filter((x): x is { status: string; at: Date } => x.status !== null);

  const findSinalite = (s: string) => sinaliteStatuses.find((x) => x.status === s)?.at ?? null;

  const paymentAt = eventByKind.get('PAYMENT_SUCCEEDED') ?? order.paidAt;
  const submittedAt = eventByKind.get('SINALITE_SUBMITTED');
  const productionAt = findSinalite('IN_PRODUCTION');
  const shippedAt = findSinalite('SHIPPED');
  const deliveredAt = findSinalite('DELIVERED');

  return [
    {
      label: 'Paiement confirmé',
      description: paymentAt ? 'Carte chargée, début du workflow.' : 'En attente du paiement.',
      done: !!paymentAt,
      current: status === 'PAID' && !submittedAt,
      timestamp: paymentAt ? formatDateTime(paymentAt) : null,
    },
    {
      label: 'Envoi à la presse',
      description: 'Notre presse reçoit ta commande pour le prepress.',
      done: !!submittedAt || ['IN_PRODUCTION', 'SHIPPED', 'DELIVERED'].includes(status),
      current: status === 'SUBMITTED',
      timestamp: submittedAt ? formatDateTime(submittedAt) : null,
    },
    {
      label: 'En production',
      description: 'Tes fichiers sont imprimés et finis.',
      done: !!productionAt || ['SHIPPED', 'DELIVERED'].includes(status),
      current: status === 'IN_PRODUCTION',
      timestamp: productionAt ? formatDateTime(productionAt) : null,
    },
    {
      label: 'Expédiée',
      description: 'En route vers ton adresse.',
      done: !!shippedAt || status === 'DELIVERED',
      current: status === 'SHIPPED',
      timestamp: shippedAt ? formatDateTime(shippedAt) : null,
    },
    {
      label: 'Livrée',
      description: 'Reçue à destination.',
      done: status === 'DELIVERED',
      current: false,
      timestamp: deliveredAt ? formatDateTime(deliveredAt) : null,
    },
  ];
}

/**
 * Lit le `status` à partir du payload JSON d'un SINALITE_STATUS_CHANGED.
 * Tolère l'ancien format imbriqué `{payload:{status}}` écrit avant le fix
 * du format plat (docs/experience-client-2026-07.md Foyer 5) — les commandes
 * déjà en base ne doivent pas perdre leur historique.
 */
export function extractSinaliteStatus(data: string): string | null {
  try {
    const parsed = JSON.parse(data) as { status?: string; payload?: { status?: string } };
    return parsed.status ?? parsed.payload?.status ?? null;
  } catch {
    return null;
  }
}

export interface TrackingInfo {
  number: string;
  carrier: string;
  url?: string;
}

/**
 * Cherche le dernier event Sinalite contenant un trackingNumber + carrier
 * et calcule l'URL profonde du transporteur si possible.
 */
export function extractTracking(
  events: { kind: string; data: string | null }[],
): TrackingInfo | null {
  // Le tracking peut arriver via SHIPPED ou IN_PRODUCTION selon le partner —
  // on scan tous les events Sinalite et prend le plus récent qui a un number.
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind !== 'SINALITE_STATUS_CHANGED' || !e.data) continue;
    try {
      const parsed = JSON.parse(e.data) as {
        trackingNumber?: string;
        carrier?: string;
        payload?: { trackingNumber?: string; carrier?: string };
      };
      // Tolère l'ancien format imbriqué (cf. extractSinaliteStatus).
      const trackingNumber = parsed.trackingNumber ?? parsed.payload?.trackingNumber;
      const carrierRaw = parsed.carrier ?? parsed.payload?.carrier;
      if (!trackingNumber) continue;
      const carrier = carrierRaw ?? 'UPS';
      const url = trackingDeepLink(carrier, trackingNumber);
      return { number: trackingNumber, carrier, url };
    } catch {
      continue;
    }
  }
  return null;
}

/** Génère l'URL publique de tracking sur le site du transporteur. */
export function trackingDeepLink(carrier: string, tracking: string): string | undefined {
  const c = carrier.toLowerCase();
  const t = encodeURIComponent(tracking);
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${t}`;
  if (c.includes('fedex')) return `https://www.fedex.com/fedextrack/?trknbr=${t}`;
  if (c.includes('canada') || c.includes('post')) {
    return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${t}`;
  }
  if (c.includes('purolator')) return `https://www.purolator.com/en/shipping/tracker?pin=${t}`;
  return undefined;
}

export interface EtaOrderInput {
  createdAt: Date;
  status: string;
  productionDays?: number | null;
  transitDays?: number | null;
}

/**
 * Calcule la date brute d'ETA (ou de livraison si déjà livrée). Extrait de
 * computeOrderEta pour être réutilisé par le générateur .ics (finding [17])
 * qui a besoin du `Date`, pas du texte formaté — avant, calendar.ics/route.ts
 * DUPLIQUAIT cette heuristique inline (dérive garantie au premier changement
 * de l'une des deux copies).
 *
 * finding [17] — utilise les jours de production/transit RÉELS captés à la
 * commande (order.productionDays/transitDays, cf. migration
 * 20260727160000) quand ils sont connus. Sinon repli sur l'heuristique
 * forfaitaire d'origine (4j production + 3j transit = 7j avant expédition,
 * 3j transit après) — EXACTEMENT le même total qu'avant ce fix, donc aucune
 * régression pour les commandes sans données réelles (pré-migration, MCP
 * headless, résolution Sinalite indisponible à la commande).
 * Returns null si l'order est annulée/échouée.
 */
export function computeOrderEtaDate(order: EtaOrderInput, shippedAt?: Date | null): Date | null {
  if (order.status === 'CANCELLED' || order.status === 'FAILED') return null;
  if (order.status === 'DELIVERED' && shippedAt) return shippedAt;
  const base = shippedAt ?? order.createdAt;
  const daysAhead = shippedAt
    ? (order.transitDays ?? 3)
    : (order.productionDays ?? 4) + (order.transitDays ?? 3);
  const eta = new Date(base);
  eta.setDate(eta.getDate() + daysAhead);
  return eta;
}

/** Estime un ETA formaté (jour + texte relatif) à partir des timestamps disponibles. */
export function computeOrderEta(
  order: EtaOrderInput,
  shippedAt?: Date | null,
): { day: string; relative: string } | null {
  if (order.status === 'DELIVERED' && shippedAt) {
    return { day: formatDateShort(shippedAt), relative: 'livrée' };
  }
  const eta = computeOrderEtaDate(order, shippedAt);
  if (!eta) return null;
  const today = new Date();
  const diffDays = Math.round((eta.getTime() - today.getTime()) / (24 * 3600 * 1000));
  const relative =
    diffDays <= 0 ? 'aujourd\'hui' : diffDays === 1 ? 'demain' : `dans ${diffDays} jours`;
  return { day: formatDateShort(eta), relative };
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' });
}

function formatDateTime(d: Date): string {
  return `${formatDate(d.toISOString())} · ${d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
