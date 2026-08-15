/**
 * Calcul PUR du rapport de taxes — SOURCE UNIQUE partagée par la page de preview
 * (`/admin/finances/tax-report`) ET l'export CSV (`/api/admin/finances/tax-report`)
 * pour garantir « écran == export » par construction (audit admin 2026-07 §4a : la
 * page affichait une taxe BRUTE quand le CSV exportait une taxe NETTE des refunds).
 *
 * Deux corrections encapsulées ici :
 *  - Round 38 #2 : taxable subtotal RÉEL (subtotal − remise − remise reseller +
 *    livraison), pas subtotal seul ; le split TPS/TVQ scale sur la taxe stockée.
 *  - Audit §3.2 : NET des remboursements — chaque commande est réduite au prorata
 *    (`netFactor`) du montant remboursé dans la période (total → 0, partiel → scalé).
 */
import { computeTax } from '@/lib/taxes';
import type { CaProvince } from '@/lib/sinalite/types';
import { refundAmountCentsOf } from '@/lib/finances/refund-amount';

export interface TaxReportOrderInput {
  id: string;
  paidAt: Date | null;
  shipProvince: string;
  subtotalCents: number;
  discountCents: number;
  resellerDiscountCents: number;
  shippingCents: number;
  taxCents: number;
  amountCents: number;
}
/**
 * Un `REFUND_ISSUED` ou un `REFUND_FAILED` survenu DANS la période.
 *
 * ⚠️ PORTE LA COMMANDE D'ORIGINE, QUI PEUT ÊTRE HORS PÉRIODE. C'est ce qui
 * permet de reconstituer sa proportion taxe/sous-total — et donc de traiter
 * SYMÉTRIQUEMENT les deux sens. Un jet précédent ne chargeait la commande que
 * pour les reprises : les remboursements sur commandes hors période n'étaient
 * alors soustraits de RIEN, pendant que les reprises étaient ajoutées sans
 * condition. Sur une commande payée le 28 mars et remboursée le 3 avril, la
 * taxe se retrouvait déclarée DEUX FOIS.
 */
export interface TaxReportRefundInput {
  orderId: string | null;
  data: string | null;
  order: {
    amountCents: number;
    subtotalCents: number;
    taxCents: number;
    shipProvince: string;
  } | null;
}
/** Alias historique — même forme. */
export type TaxReportRepriseInput = TaxReportRefundInput;

export interface TaxReportRow {
  id: string;
  paidAt: Date | null;
  province: string;
  subtotalCents: number;
  gstCents: number;
  pstCents: number;
  qstCents: number;
  hstCents: number;
  totalTaxCents: number;
  totalChargedCents: number;
}
export interface TaxReportResult {
  rows: TaxReportRow[];
  summary: {
    gstCents: number;
    pstCents: number;
    qstCents: number;
    hstCents: number;
    totalSubtotalCents: number;
    totalTaxCents: number;
    totalChargedCents: number;
    orderCount: number;
    refundedCents: number;
    /**
     * Remboursements DÉMENTIS par Stripe pendant cette période — l'argent est
     * revenu chez Plio, donc il rentre dans l'assiette de CETTE période.
     */
    repriseCents: number;
    /** Part des reprises portant sur des commandes HORS période. */
    repriseHorsPeriodeCents: number;
  };
  byProvince: Array<{ province: string; count: number; subtotalCents: number; taxCents: number }>;
}

/**
 * ⚠️ RÈGLE TEMPORELLE : CHAQUE ÉVÉNEMENT AFFECTE LA PÉRIODE OÙ IL S'EST PRODUIT.
 *
 * Un remboursement émis en mai puis DÉMENTI par Stripe en juillet (carte
 * fermée, banque qui refuse le retour) ramène l'argent chez Plio. Deux
 * traitements étaient possibles ; Patrick a tranché pour celui-ci :
 *
 *   · mai reste INCHANGÉ — le rapport était juste au moment où il a été
 *     produit, et s'il a déjà servi à une remise, il n'y a rien à amender ;
 *   · juillet REPREND le montant, en ligne d'ajustement explicite.
 *
 * L'alternative — recalculer mai à la vérité d'aujourd'hui — ferait rendre
 * DEUX chiffres différents au même mois selon la date d'exécution, et
 * imposerait une déclaration modifiée sur une période déjà remise.
 *
 * ⚠️ LE TABLEAU DE BORD `/admin/finances`, LUI, MONTRE LA VÉRITÉ D'AUJOURD'HUI
 * et n'applique donc PAS cette règle : c'est une vue de gestion, pas une
 * déclaration. Les deux peuvent diverger pour un même mois, à dessein, et
 * l'interface le dit.
 *
 * Cas dégénéré vérifié : un remboursement émis ET démenti dans la MÊME période
 * se soustrait puis se reprend — net zéro, sans double comptage.
 */
/**
 * Somme par commande, DÉDUPLIQUÉE PAR `refundId`.
 *
 * ⚠️ LE `Set` PAR `refundId` EST L'INVARIANT, ET UN JET PRÉCÉDENT L'A PERDU.
 * Le garde d'idempotence de `charge.refund.updated` est une lecture-puis-
 * écriture non atomique, et le rejeu depuis `/admin/webhooks` court-circuite
 * la déduplication du webhook : deux `REFUND_FAILED` pour un même `re_…` sont
 * atteignables. Le commentaire de `stripe-process.ts` documente précisément
 * que le doublon n'est inoffensif QUE parce que les consommateurs accumulent
 * dans un ensemble et ne somment jamais.
 *
 * Sommer sans dédupliquer faisait compter 890 $ là où Stripe n'avait rendu que
 * 445 $ — et le plafond `Math.min(1, …)` rendait le défaut SILENCIEUX, sans
 * aucune valeur aberrante en sortie.
 */
function agregerParCommande(
  events: TaxReportRefundInput[],
  opts: { repliSurTotal: boolean },
): Map<string, number> {
  // `orderId` → `refundId` → montant. La clé interne rend le doublon inerte.
  const parCommande = new Map<string, Map<string, number>>();
  let anonymes = 0;
  for (const e of events) {
    if (!e.orderId) continue;
    let montant: number | null = null;
    let refundId: string | null = null;
    if (e.data) {
      try {
        const parsed = JSON.parse(e.data) as { amountCents?: unknown; refundId?: unknown };
        if (typeof parsed.amountCents === 'number' && Number.isFinite(parsed.amountCents)) {
          montant = parsed.amountCents;
        }
        if (typeof parsed.refundId === 'string' && parsed.refundId) refundId = parsed.refundId;
      } catch {
        montant = null;
      }
    }
    if (montant === null) {
      if (!opts.repliSurTotal) continue;
      montant = e.order?.amountCents ?? 0;
    }
    if (montant <= 0) continue;
    const parRefund = parCommande.get(e.orderId) ?? new Map<string, number>();
    // Sans `refundId` exploitable, on ne peut pas dédupliquer : clé unique par
    // occurrence, ce qui préserve le comportement historique.
    parRefund.set(refundId ?? `anon_${anonymes++}`, montant);
    parCommande.set(e.orderId, parRefund);
  }
  const total = new Map<string, number>();
  for (const [orderId, parRefund] of parCommande) {
    let s = 0;
    for (const m of parRefund.values()) s += m;
    total.set(orderId, s);
  }
  return total;
}

export function computeTaxReport(
  orders: TaxReportOrderInput[],
  refunds: TaxReportRefundInput[],
  reprises: TaxReportRepriseInput[] = [],
): TaxReportResult {
  const refundedByOrderId = agregerParCommande(refunds, { repliSurTotal: true });
  // Reprises : PAS de repli sur le total de la commande — un montant illisible
  // vaut « on ne sait pas », et reprendre le total entier gonflerait l'assiette
  // d'un montant inventé.
  const repriseByOrderId = agregerParCommande(reprises, { repliSurTotal: false });
  const idsDansRapport = new Set(orders.map((o) => o.id));
  const commandeParId = new Map<string, NonNullable<TaxReportRefundInput['order']>>();
  for (const e of [...refunds, ...reprises]) {
    if (e.orderId && e.order && !commandeParId.has(e.orderId)) commandeParId.set(e.orderId, e.order);
  }

  const summary = {
    gstCents: 0, pstCents: 0, qstCents: 0, hstCents: 0,
    totalSubtotalCents: 0, totalTaxCents: 0, totalChargedCents: 0,
    orderCount: 0, refundedCents: 0,
    repriseCents: 0, repriseHorsPeriodeCents: 0,
  };
  const provMap = new Map<string, { count: number; subtotalCents: number; taxCents: number }>();
  const rows: TaxReportRow[] = [];

  for (const o of orders) {
    // NET des remboursements — plafonné à amountCents (jamais négatif).
    // Émis dans la période MOINS repris dans la période. Un remboursement
    // émis puis démenti le même mois se neutralise ici.
    const refundedCents = Math.min(
      o.amountCents,
      Math.max(0, (refundedByOrderId.get(o.id) ?? 0) - (repriseByOrderId.get(o.id) ?? 0)),
    );
    const netFactor = o.amountCents > 0 ? Math.max(0, 1 - refundedCents / o.amountCents) : 1;
    summary.refundedCents += refundedCents;
    const netSubtotalCents = Math.round(o.subtotalCents * netFactor);
    const netTaxCents = Math.round(o.taxCents * netFactor);
    const netChargedCents = Math.round(o.amountCents * netFactor);

    // Taxable subtotal RÉEL (Round 38 #2). computeTax dérive le SPLIT TPS/TVQ ;
    // on scale ensuite sur la taxe nette pour préserver la somme exacte.
    const taxableSubtotal = (
      o.subtotalCents - o.discountCents - o.resellerDiscountCents + o.shippingCents
    ) / 100;
    const breakdown = computeTax(taxableSubtotal, o.shipProvince as CaProvince);
    const computedTotalCents = Math.round(breakdown.total * 100);
    const scale = computedTotalCents > 0 ? netTaxCents / computedTotalCents : 0;

    const taxByCode: Record<'gst' | 'pst' | 'qst' | 'hst', number> = { gst: 0, pst: 0, qst: 0, hst: 0 };
    for (const line of breakdown.lines) {
      taxByCode[line.code] = Math.round(line.amount * 100 * scale);
    }
    // Absorption du drift d'arrondi (≤ 1¢) sur la plus grosse ligne.
    const summedTax = taxByCode.gst + taxByCode.pst + taxByCode.qst + taxByCode.hst;
    const drift = netTaxCents - summedTax;
    if (drift !== 0 && breakdown.lines.length > 0) {
      const biggestCode = breakdown.lines.reduce((max, l) =>
        Math.round(l.amount * 100 * scale) > Math.round(max.amount * 100 * scale) ? l : max,
      ).code;
      taxByCode[biggestCode] += drift;
    }
    const totalTaxCents = taxByCode.gst + taxByCode.pst + taxByCode.qst + taxByCode.hst;

    summary.gstCents += taxByCode.gst;
    summary.pstCents += taxByCode.pst;
    summary.qstCents += taxByCode.qst;
    summary.hstCents += taxByCode.hst;
    summary.totalSubtotalCents += netSubtotalCents;
    summary.totalTaxCents += totalTaxCents;
    summary.totalChargedCents += netChargedCents;
    summary.orderCount++;

    const prov = provMap.get(o.shipProvince) ?? { count: 0, subtotalCents: 0, taxCents: 0 };
    prov.count++;
    prov.subtotalCents += netSubtotalCents;
    prov.taxCents += totalTaxCents;
    provMap.set(o.shipProvince, prov);

    rows.push({
      id: o.id,
      paidAt: o.paidAt,
      province: o.shipProvince,
      subtotalCents: netSubtotalCents,
      gstCents: taxByCode.gst,
      pstCents: taxByCode.pst,
      qstCents: taxByCode.qst,
      hstCents: taxByCode.hst,
      totalTaxCents,
      totalChargedCents: netChargedCents,
    });
  }

  // ═══ AJUSTEMENTS SUR COMMANDES HORS PÉRIODE ═══════════════════════════
  //
  // C'est LE cas qui motive toute cette règle : un remboursement émis en mai,
  // démenti en juillet. La commande de mai n'est pas dans le rapport de
  // juillet (sélection par `paidAt`), donc l'événement n'a aucune ligne où
  // aller — il serait perdu en silence.
  //
  // ⚠️ SYMÉTRIQUE DANS LES DEUX SENS, et un jet précédent ne l'était pas : il
  // n'ajustait QUE les reprises. Les remboursements sur commandes hors période
  // n'étaient alors soustraits de RIEN — ni de leur période d'origine (la
  // commande n'y était pas remboursée), ni d'aucune autre. Sur une commande
  // payée le 28 mars et remboursée le 3 avril, la taxe se retrouvait déclarée
  // DEUX FOIS. Avec les préréglages « mois en cours / mois précédent », ce
  // n'est pas un cas de coin : c'est l'ordinaire.
  //
  // Les commandes DÉJÀ dans le rapport sont exclues : leur netting a eu lieu
  // ci-dessus, les reprendre serait un double comptage.
  const idsAjustes = new Set<string>([...refundedByOrderId.keys(), ...repriseByOrderId.keys()]);
  for (const orderId of idsAjustes) {
    if (idsDansRapport.has(orderId)) continue;
    const cmd = commandeParId.get(orderId);
    if (!cmd || cmd.amountCents <= 0) continue;

    const repris = repriseByOrderId.get(orderId) ?? 0;
    const emis = refundedByOrderId.get(orderId) ?? 0;
    // Signe : positif = l'argent revient dans l'assiette de cette période.
    const net = Math.max(-cmd.amountCents, Math.min(cmd.amountCents, repris - emis));
    if (net === 0) continue;

    const part = net / cmd.amountCents;
    const subtotal = Math.round(cmd.subtotalCents * part);
    const taxe = Math.round(cmd.taxCents * part);
    const charge = Math.round(cmd.amountCents * part);

    summary.totalSubtotalCents += subtotal;
    summary.totalTaxCents += taxe;
    summary.totalChargedCents += charge;

    // Le SPLIT par taxe suit la province de la commande d'origine.
    const breakdown = computeTax(Math.abs(subtotal) / 100, cmd.shipProvince as CaProvince);
    const totalCalcule = Math.round(breakdown.total * 100);
    if (totalCalcule > 0) {
      const signe = taxe < 0 ? -1 : 1;
      const echelle = Math.abs(taxe) / totalCalcule;
      const parCode: Record<'gst' | 'pst' | 'qst' | 'hst', number> = { gst: 0, pst: 0, qst: 0, hst: 0 };
      for (const line of breakdown.lines) {
        parCode[line.code] = signe * Math.round(line.amount * 100 * echelle);
      }
      // ⚠️ MÊME ABSORPTION D'ARROMDI QUE LA BOUCLE PAR COMMANDE. Sans elle,
      // `totalTaxCents !== gst + pst + qst + hst` — invariant que tout le
      // reste du fichier défend, et que le CSV imprime en deux lignes que
      // l'admin recopie dans deux formulaires distincts.
      const somme = parCode.gst + parCode.pst + parCode.qst + parCode.hst;
      const drift = taxe - somme;
      if (drift !== 0 && breakdown.lines.length > 0) {
        const plusGros = breakdown.lines.reduce((max, l) => (l.amount > max.amount ? l : max)).code;
        parCode[plusGros] += drift;
      }
      summary.gstCents += parCode.gst;
      summary.pstCents += parCode.pst;
      summary.qstCents += parCode.qst;
      summary.hstCents += parCode.hst;
    }

    // ⚠️ `count` N'EST PAS INCRÉMENTÉ : aucune COMMANDE n'appartient à cette
    // période, seul un ajustement s'y rattache. L'écran le dit explicitement,
    // sinon une ligne « BC · 0 commande · 100,00 $ » ressemble à un bug sur un
    // tableau qui sert à remplir une déclaration.
    const prov = provMap.get(cmd.shipProvince) ?? { count: 0, subtotalCents: 0, taxCents: 0 };
    prov.subtotalCents += subtotal;
    prov.taxCents += taxe;
    provMap.set(cmd.shipProvince, prov);

    if (repris > 0) summary.repriseHorsPeriodeCents += repris;
  }

  // Total des reprises, toutes commandes confondues (chiffre d'affichage).
  for (const montant of repriseByOrderId.values()) summary.repriseCents += montant;

  const byProvince = [...provMap.entries()].map(([province, s]) => ({ province, ...s }));
  return { rows, summary, byProvince };
}
