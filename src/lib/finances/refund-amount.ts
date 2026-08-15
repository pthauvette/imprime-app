/**
 * Montant réellement remboursé d'un OrderEvent REFUND_ISSUED (Audit v2 #10.6).
 *
 * Avant : le dashboard finances sommait `order.amountCents` (TOTAL de la
 * commande) pour chaque refund → un refund PARTIEL (20 $ sur 80 $) comptait
 * 80 $ → revenu net (rev − refunds) faussé à la baisse.
 *
 * Depuis le fix, `markRefundIssued` stocke `amountCents` (= refund.amount
 * Stripe) dans `OrderEvent.data`. On le lit ici ; fallback sur le total de la
 * commande pour les events ANTÉRIEURS au fix (qui n'ont que { refundId }).
 */
/**
 * Statuts « commande génératrice de revenu net » — exclut PENDING (jamais payée),
 * CANCELLED et FAILED (ventes annulées/remboursées, voidées). SOURCE UNIQUE
 * partagée par les surfaces finances (dashboard, export XLSX, tax-report) pour
 * qu'elles comptent TOUTES le revenu de la même façon (audit admin 2026-07 §3).
 *
 * Définition canonique : brut = Σ amountCents des commandes payées de ces statuts ;
 * refunds = Σ montants REFUND_ISSUED SUR CES commandes (chemin /refund sur une
 * commande vivante) ; net = brut − refunds. Une commande annulée est exclue du
 * brut ET son refund est exclu (sinon double-soustraction).
 */
export const PAID_STATUSES = ['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'] as const;

export interface RefundEventLike {
  data: string | null;
  order: { amountCents: number } | null;
}

export function refundAmountCentsOf(ev: RefundEventLike): number {
  if (ev.data) {
    try {
      const parsed = JSON.parse(ev.data) as { amountCents?: unknown };
      if (typeof parsed.amountCents === 'number' && Number.isFinite(parsed.amountCents)) {
        return parsed.amountCents;
      }
    } catch {
      // data malformé → fallback ci-dessous
    }
  }
  return ev.order?.amountCents ?? 0;
}

/**
 * `refundId` des remboursements que Stripe a ANNULÉS (`REFUND_FAILED`).
 *
 * ⚠️ SOURCE UNIQUE, ET C'EST LE POINT. Trois surfaces doivent savoir qu'un
 * `REFUND_ISSUED` peut avoir été démenti : la réconciliation financière, le
 * restant remboursable de la fiche admin, et `/api/admin/orders/[id]/refund`
 * — qui, lui, l'apprend de Stripe (`r.status !== 'failed'`) et non des events.
 *
 * Sans ce partage, la fiche affichait « Déjà remboursé : 890 $ / 890 $ » et un
 * bouton « Rembourser » GRISÉ, sur une commande dont l'alerte venait de dire
 * « réémets le remboursement ». L'admin partait alors au dashboard Stripe —
 * ce que l'alerte lui demande — et ce nouveau remboursement n'écrivant aucun
 * `REFUND_ISSUED`, la ligne de réconciliation ne se refermait JAMAIS.
 */
export function refundsAnnulesDe(events: { kind: string; data: string | null }[]): Set<string> {
  const annules = new Set<string>();
  for (const e of events) {
    if (e.kind !== 'REFUND_FAILED' || !e.data) continue;
    try {
      const id = (JSON.parse(e.data) as { refundId?: unknown }).refundId;
      if (typeof id === 'string' && id) annules.add(id);
    } catch {
      // Un `REFUND_FAILED` illisible ne peut annuler personne nommément.
    }
  }
  return annules;
}

/** Ce `REFUND_ISSUED` a-t-il été démenti par un `REFUND_FAILED` ? */
export function refundEstAnnule(ev: { data: string | null }, annules: Set<string>): boolean {
  if (!ev.data || annules.size === 0) return false;
  try {
    const id = (JSON.parse(ev.data) as { refundId?: unknown }).refundId;
    return typeof id === 'string' && annules.has(id);
  } catch {
    return false;
  }
}

/**
 * Montant DÉJÀ REMBOURSÉ d'une commande, remboursements démentis exclus.
 *
 * ⚠️ EXTRAIT DE LA FICHE ADMIN POUR ÊTRE ÉPROUVÉ. Le calcul vivait en ligne
 * dans un Server Component, donc hors de portée des tests (`environment:
 * 'node'`, ni RTL ni jsdom installés) : une campagne de mutation a montré
 * qu'on pouvait retirer la déduction des `REFUND_FAILED` sans faire rougir
 * quoi que ce soit. C'est pourtant elle qui décide si le bouton
 * « Rembourser » est cliquable sur une commande dont le remboursement a
 * échoué — c'est-à-dire exactement quand l'admin en a besoin.
 *
 * Plafonné au total de la commande : §8.5, un cumul d'events ne doit pas
 * dépasser ce qui a été encaissé.
 */
export function dejaRembourseCents(
  events: { kind: string; data: string | null }[],
  amountCents: number,
): number {
  const annules = refundsAnnulesDe(events);
  const somme = events
    .filter((e) => e.kind === 'REFUND_ISSUED' && !refundEstAnnule(e, annules))
    .reduce((s, e) => s + refundAmountCentsOf({ data: e.data, order: { amountCents } }), 0);
  return Math.min(amountCents, somme);
}

/**
 * Somme des remboursements RÉELLEMENT rendus sur une période.
 *
 * ⚠️ POURQUOI LA LISTE CONTIENT DEUX KINDS ET DEUX PÉRIODES.
 * Un remboursement émis en mai peut être démenti en juillet : filtrer les
 * `REFUND_FAILED` sur la même fenêtre que les `REFUND_ISSUED` raterait
 * exactement ce cas. L'appelant charge donc TOUS les événements des commandes
 * concernées, sans borne, et c'est ici qu'on borne — mais SEULEMENT les
 * émissions.
 *
 * ⚠️ LE FILTRE TEMPOREL EST INDISPENSABLE. Sans lui, une commande remboursée
 * en avril PUIS en mai verrait ses deux remboursements comptés dans le chiffre
 * de mai. Le `where` Prisma ne peut pas le faire à notre place : il doit
 * ramener les démentis hors période.
 *
 * ⚠️ VÉRITÉ D'AUJOURD'HUI. Un remboursement démenti ne compte JAMAIS, même si
 * le démenti est postérieur à la période. C'est le choix des surfaces de
 * GESTION (tableau de bord, export) ; le rapport de taxes applique la règle
 * inverse — chaque événement dans sa période — pour ne pas réécrire une
 * période déjà déclarée. Voir `computeTaxReport`.
 */
export function sommeRemboursementsValidesCents(
  events: { kind: string; data: string | null; createdAt: Date; order: { amountCents: number } | null }[],
  periode: { debut: Date; fin: Date },
): { totalCents: number; count: number } {
  const annules = refundsAnnulesDe(events);
  let totalCents = 0;
  let count = 0;
  for (const e of events) {
    if (e.kind !== 'REFUND_ISSUED') continue;
    if (e.createdAt < periode.debut || e.createdAt >= periode.fin) continue;
    if (refundEstAnnule(e, annules)) continue;
    totalCents += refundAmountCentsOf(e);
    count++;
  }
  return { totalCents, count };
}
