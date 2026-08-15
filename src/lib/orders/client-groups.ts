/**
 * Regroupement des commandes tel que le CLIENT les voit sur `/orders`.
 *
 * Extrait de la page pour être testable sans tirer NextAuth (même raison que
 * `lib/orders/event-describe.ts`), et surtout pour qu'il n'existe qu'UNE
 * dérivation : la liste filtrée et le compte des pastilles lisaient chacun
 * leur propre table. Deux tables qui divergent, c'est « Annulées 1 » et un
 * clic qui n'affiche rien.
 */

import type { OrderStatus } from '@/lib/db/orders';

export type StatusFilter = 'live' | 'shipped' | 'delivered' | 'cancelled';

export const STATUS_GROUPS: Record<StatusFilter, OrderStatus[]> = {
  live: ['PAID', 'SUBMITTED', 'IN_PRODUCTION'],
  shipped: ['SHIPPED'],
  delivered: ['DELIVERED'],
  cancelled: ['CANCELLED', 'FAILED'],
};

export function isStatusFilter(s: string | undefined): s is StatusFilter {
  return s === 'live' || s === 'shipped' || s === 'delivered' || s === 'cancelled';
}

/** Forme minimale dont dépend le regroupement. */
export interface CommandeGroupable {
  status: OrderStatus;
  /** Soumission partie sans réponse, aucun numéro fournisseur rattaché. */
  verificationEnCours?: boolean;
}

/**
 * Groupe d'affichage d'une commande.
 *
 * ⚠️ PAS UNE SIMPLE LECTURE DE `STATUS_GROUPS`. Une commande dont la
 * soumission est partie sans réponse est `FAILED` en base — donc rangée sous
 * « Annulées », avec le libellé « Échec ». Or elle est payée, NON remboursée
 * (à dessein : la production est peut-être lancée) et en attente d'une
 * vérification humaine. Le client la voyait annulée alors que son argent était
 * encaissé. Elle appartient à « En cours », la seule des quatre étiquettes qui
 * soit vraie.
 *
 * Le repli `'live'` couvre les statuts absents de la table (`PENDING`) : sans
 * lui, la commande n'apparaissait sous AUCUNE pastille — invisible plutôt que
 * mal rangée.
 */
export function groupeDe(o: CommandeGroupable): StatusFilter {
  if (o.verificationEnCours) return 'live';
  return (
    (Object.keys(STATUS_GROUPS) as StatusFilter[]).find((g) =>
      STATUS_GROUPS[g].includes(o.status),
    ) ?? 'live'
  );
}

/** Comptes des pastilles — dérivés de `groupeDe`, jamais de `status` seul. */
export function bucketStatus(orders: CommandeGroupable[]) {
  const counts = { total: orders.length, live: 0, done: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 };
  for (const o of orders) {
    const g = groupeDe(o);
    if (g === 'live') counts.live++;
    if (g === 'shipped') counts.SHIPPED++;
    if (g === 'delivered') counts.DELIVERED++;
    if (g === 'cancelled') counts.CANCELLED++;
    if (g === 'shipped' || g === 'delivered') counts.done++;
  }
  return counts;
}

/**
 * Le remboursement est-il proposable depuis la fiche ?
 *
 * ⚠️ EXTRAIT DE `OrderActions.tsx` POUR ÊTRE ÉPROUVÉ POUR DE VRAI. La revue
 * money-path a relevé, à raison, que le test qui « verrouillait » cette règle
 * lisait le TEXTE SOURCE et assertait des motifs de chaîne : il passait donc
 * sur `… && (status !== 'FAILED' || encaissee) && false`. Un test de chaîne se
 * tue trivialement en changeant la chaîne, sans rien prouver du comportement.
 *
 * Le dépôt tourne en `environment: 'node'` sans RTL ni jsdom installés —
 * rendre le composant demanderait deux dépendances de plus. Extraire la règle
 * coûte trois lignes et la rend vérifiable.
 *
 * `FAILED` n'est plus exclu sèchement : une soumission partie sans réponse
 * laisse la commande FAILED avec l'argent CONSERVÉ, et rembourser n'était
 * offert nulle part alors que la route l'accepte. `encaissee` borne le geste à
 * de l'argent réel (une commande FAILED faute de 3-D Secure n'a rien à rendre)
 * et `restantCents > 0` écarte seul les FAILED déjà auto-remboursées.
 */
export function remboursementProposable(o: {
  status: string;
  restantCents: number;
  encaissee: boolean;
}): boolean {
  if (o.status === 'PENDING' || o.status === 'CANCELLED') return false;
  if (o.restantCents <= 0) return false;
  if (o.status === 'FAILED') return o.encaissee;
  return true;
}
