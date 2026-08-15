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
  /** Ligne d'AJUSTEMENT sur une commande d'une autre période, pas une vente. */
  ajustement?: boolean;
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
    /**
     * Ajustement NET (signé) porté par les commandes hors période : négatif
     * quand un remboursement tardif retranche, positif quand une reprise
     * rend. `repriseHorsPeriodeCents` n'en montre que la moitié positive —
     * annoncer « ajoutés à l'assiette » pendant qu'on soustrait serait faux.
     */
    ajustementHorsPeriodeCents: number;
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
  opts: { repliSurTotal: boolean; exigeRefundId?: boolean },
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
    // ⚠️ UNE REPRISE SANS `refundId` N'EST PAS DÉDUPLICABLE — donc écartée.
    // `handleRefundUpdated` en écrit toujours un, il n'existe aucun producteur
    // légitime sans, et la base est repartie à neuf en 2026-07 : une reprise
    // anonyme ne peut venir que d'une donnée corrompue. La compter rouvrirait
    // le double-comptage à l'identique. Même règle que le montant illisible :
    // ce qu'on ne peut pas vérifier, on ne le compte pas.
    if (opts.exigeRefundId && !refundId) continue;
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
  const repriseByOrderId = agregerParCommande(reprises, { repliSurTotal: false, exigeRefundId: true });
  const idsDansRapport = new Set(orders.map((o) => o.id));
  const commandeParId = new Map<string, NonNullable<TaxReportRefundInput['order']>>();
  for (const e of [...refunds, ...reprises]) {
    if (e.orderId && e.order && !commandeParId.has(e.orderId)) commandeParId.set(e.orderId, e.order);
  }

  const summary = {
    gstCents: 0, pstCents: 0, qstCents: 0, hstCents: 0,
    totalSubtotalCents: 0, totalTaxCents: 0, totalChargedCents: 0,
    orderCount: 0, refundedCents: 0,
    repriseCents: 0, repriseHorsPeriodeCents: 0, ajustementHorsPeriodeCents: 0,
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
    const repris = repriseByOrderId.get(orderId) ?? 0;
    // ⚠️ COMPTABILISÉ AVANT TOUT `continue`. Un jet précédent plaçait cette
    // ligne en fin de boucle : une reprise annulée par un remboursement du
    // même montant (`net === 0`), ou dont la commande manque, n'y arrivait
    // jamais. Le CSV imprimait alors « Reprises : 889,50 $ / dont hors
    // période : 0 $ », ce qui se lit « toutes portent sur des commandes du
    // rapport » — faux.
    if (repris > 0) summary.repriseHorsPeriodeCents += repris;

    const cmd = commandeParId.get(orderId);
    if (!cmd || cmd.amountCents <= 0) continue;

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
    const parCodeLigne: Record<'gst' | 'pst' | 'qst' | 'hst', number> = { gst: 0, pst: 0, qst: 0, hst: 0 };
    const breakdown = computeTax(Math.abs(subtotal) / 100, cmd.shipProvince as CaProvince);
    const totalCalcule = Math.round(breakdown.total * 100);
    if (totalCalcule === 0) {
      // ⚠️ SANS CE CAS, LA TAXE ENTRAIT DANS LE TOTAL ET DANS AUCUN CODE.
      // `summary.totalTaxCents` a déjà été incrémenté au-dessus : sauter la
      // ventilation rouvrait, par une autre porte, l'écart total ≠ somme des
      // lignes qu'on venait de fermer. Arrive quand le sous-total PRORATÉ est
      // assez petit pour que sa taxe arrondisse à 0 alors que la taxe
      // proratée vaut 1 ¢ — une commande dominée par la livraison.
      // La ligne fédérale est la seule présente dans les cinq régimes.
      summary.gstCents += taxe;
      parCodeLigne.gst = taxe;
    } else {
      const signe = taxe < 0 ? -1 : 1;
      const echelle = Math.abs(taxe) / totalCalcule;
      const parCode = parCodeLigne;
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
    // période, seul un ajustement s'y rattache. Une ligne « BC · 0 commande ·
    // 100,00 $ » ressemblerait sinon à un bug sur un tableau qui sert à
    // remplir une déclaration — c'est pourquoi l'écran porte une note sous ce
    // tableau (`tax-report/page.tsx`). Un jet précédent affirmait ici que
    // « l'écran le dit explicitement » alors qu'il ne disait rien : un
    // commentaire qui certifie un comportement absent est précisément ce que
    // toute cette série a appris à ne plus écrire.
    const prov = provMap.get(cmd.shipProvince) ?? { count: 0, subtotalCents: 0, taxCents: 0 };
    prov.subtotalCents += subtotal;
    prov.taxCents += taxe;
    provMap.set(cmd.shipProvince, prov);

    summary.ajustementHorsPeriodeCents += net;

    // ⚠️ UNE LIGNE PAR AJUSTEMENT, ET C'EST LE POINT.
    //
    // Depuis que la soustraction est symétrique, un ajustement hors période
    // n'est plus l'exception : TOUT remboursement qui traverse une frontière
    // de période en produit un. Sans ligne correspondante, `Σ colonne
    // total_tax` cessait d'égaler `# Total tax collected` — sur un artefact
    // dont la raison d'être est que le détail justifie le sommaire.
    //
    // Concrètement, un trimestre calme après un gros remboursement tardif
    // affichait « Total taxes : −108,86 $ », UNE commande aux chiffres
    // positifs, et rien nulle part pour nommer les 890 $ qui expliquent tout.
    // Un nombre négatif inexpliqué sur un rapport de taxes, c'est ce qui fait
    // qu'on le « corrige » à la main avant de remplir le FPZ-500.
    rows.push({
      id: orderId,
      paidAt: null, // la commande n'appartient pas à cette période
      province: cmd.shipProvince,
      subtotalCents: subtotal,
      gstCents: parCodeLigne.gst,
      pstCents: parCodeLigne.pst,
      qstCents: parCodeLigne.qst,
      hstCents: parCodeLigne.hst,
      totalTaxCents: taxe,
      totalChargedCents: charge,
      ajustement: true,
    });
  }

  // Total des reprises, toutes commandes confondues (chiffre d'affichage).
  for (const montant of repriseByOrderId.values()) summary.repriseCents += montant;

  const byProvince = [...provMap.entries()].map(([province, s]) => ({ province, ...s }));
  return { rows, summary, byProvince };
}
