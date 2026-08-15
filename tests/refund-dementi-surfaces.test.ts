/**
 * Un remboursement DÉMENTI ne doit plus réduire ce que Plio déclare.
 *
 * POURQUOI CE FICHIER. Depuis #585, un `REFUND_FAILED` dit que Stripe a annulé
 * un remboursement — carte fermée, banque qui refuse le retour — et que
 * l'argent est revenu chez Plio. Trois surfaces l'ignoraient et soustrayaient
 * donc un remboursement qui n'a jamais eu lieu :
 *
 *   · le revenu net du tableau de bord,
 *   · l'export XLSX,
 *   · et surtout le RAPPORT DE TAXES — le seul endroit où l'erreur sort vers
 *     l'extérieur : l'assiette TPS/TVQ est réduite, donc **Plio remet MOINS
 *     que dû**. Ce n'est pas du sur-signalement, c'est une sous-déclaration.
 *
 * ⚠️ DEUX RÈGLES TEMPORELLES OPPOSÉES, À DESSEIN (décision de Patrick) :
 *   · gestion (tableau de bord, export) → VÉRITÉ D'AUJOURD'HUI : un démenti
 *     écarte le remboursement quelle que soit sa période ;
 *   · déclaration (rapport de taxes) → CHAQUE ÉVÉNEMENT DANS SA PÉRIODE : mai
 *     reste inchangé, juillet reprend le montant. On ne réécrit jamais une
 *     période déjà remise.
 */
import { describe, it, expect } from 'vitest';
import { sommeRemboursementsValidesCents } from '@/lib/finances/refund-amount';
import { computeTaxReport } from '@/lib/finances/tax-report';

const MAI = { debut: new Date('2026-05-01'), fin: new Date('2026-06-01') };

const emis = (id: string, cents: number, quand: string) => ({
  kind: 'REFUND_ISSUED',
  data: JSON.stringify({ refundId: id, amountCents: cents }),
  createdAt: new Date(quand),
  order: { amountCents: 89000 },
});
const dementi = (id: string, cents: number, quand: string) => ({
  kind: 'REFUND_FAILED',
  data: JSON.stringify({ refundId: id, amountCents: cents, raison: 'expired_or_canceled' }),
  createdAt: new Date(quand),
  order: { amountCents: 89000 },
});

describe('surfaces de GESTION — vérité d’aujourd’hui', () => {
  it('remboursement valide dans la période → compté', () => {
    expect(sommeRemboursementsValidesCents([emis('re_1', 20000, '2026-05-10')], MAI)).toEqual({
      totalCents: 20000, count: 1,
    });
  });

  it('⚠️ démenti dans la MÊME période → écarté', () => {
    const evts = [emis('re_1', 20000, '2026-05-10'), dementi('re_1', 20000, '2026-05-20')];
    expect(sommeRemboursementsValidesCents(evts, MAI).totalCents).toBe(0);
  });

  it('⚠️ démenti dans une période POSTÉRIEURE → écarté quand même', () => {
    // C'est le cas qui motive tout le lot : borner les démentis sur la même
    // fenêtre que les émissions l'aurait raté.
    const evts = [emis('re_1', 20000, '2026-05-10'), dementi('re_1', 20000, '2026-07-03')];
    expect(sommeRemboursementsValidesCents(evts, MAI).totalCents).toBe(0);
  });

  it('le démenti ne rattache que SON remboursement', () => {
    const evts = [emis('re_a', 5000, '2026-05-10'), emis('re_b', 3000, '2026-05-12'), dementi('re_b', 3000, '2026-07-01')];
    expect(sommeRemboursementsValidesCents(evts, MAI)).toEqual({ totalCents: 5000, count: 1 });
  });

  it('⚠️ un remboursement HORS période ne compte pas', () => {
    // La requête ramène volontairement les événements sans borne SQL pour
    // attraper les démentis tardifs. Sans ce filtre côté JS, une commande
    // remboursée en avril PUIS en mai verrait ses deux remboursements comptés
    // dans le chiffre de mai.
    const evts = [emis('re_avril', 9000, '2026-04-15'), emis('re_mai', 2000, '2026-05-15')];
    expect(sommeRemboursementsValidesCents(evts, MAI)).toEqual({ totalCents: 2000, count: 1 });
  });

  it('la borne haute est EXCLUSIVE (1er juin n’est pas en mai)', () => {
    expect(sommeRemboursementsValidesCents([emis('re_1', 1000, '2026-06-01')], MAI).totalCents).toBe(0);
  });
});

// ─── Rapport de taxes ────────────────────────────────────────────────────
const commande = {
  id: 'o1', paidAt: new Date('2026-05-05'), shipProvince: 'QC',
  subtotalCents: 10000, discountCents: 0, resellerDiscountCents: 0,
  shippingCents: 0, taxCents: 1498, amountCents: 11498,
};
const refundEvt = (cents: number, refundId = 're_emis') => ({
  orderId: 'o1',
  data: JSON.stringify({ refundId, amountCents: cents }),
  order: {
    amountCents: commande.amountCents, subtotalCents: commande.subtotalCents,
    taxCents: commande.taxCents, shipProvince: commande.shipProvince,
  },
});
const repriseEvt = (
  orderId: string,
  cents: number,
  refundId = 're_1',
  order: typeof commande | null = commande,
) => ({
  orderId,
  data: JSON.stringify({ refundId, amountCents: cents }),
  order: order && {
    amountCents: order.amountCents, subtotalCents: order.subtotalCents,
    taxCents: order.taxCents, shipProvince: order.shipProvince,
  },
});

describe('rapport de taxes — chaque événement dans SA période', () => {
  it('sans remboursement, l’assiette est pleine', () => {
    const r = computeTaxReport([commande], []);
    expect(r.summary.totalSubtotalCents).toBe(10000);
    expect(r.summary.repriseCents).toBe(0);
  });

  it('remboursement intégral → assiette nulle (comportement d’origine)', () => {
    const r = computeTaxReport([commande], [refundEvt(11498)]);
    expect(r.summary.totalSubtotalCents).toBe(0);
    expect(r.summary.totalTaxCents).toBe(0);
  });

  it('⚠️ émis ET démenti dans la MÊME période → net zéro, sans double comptage', () => {
    const r = computeTaxReport([commande], [refundEvt(11498)], [repriseEvt('o1', 11498)]);
    expect(r.summary.totalSubtotalCents).toBe(10000);
    expect(r.summary.repriseCents).toBe(11498);
    // La commande EST dans le rapport : sa reprise a été nettée, pas ajoutée
    // une seconde fois en ajustement.
    expect(r.summary.repriseHorsPeriodeCents).toBe(0);
  });

  it('⚠️ LE CAS QUI MOTIVE LA RÈGLE : commande HORS période, démenti dans la période', () => {
    // Commande de mai, démenti en juillet. Le rapport de juillet ne contient
    // pas la commande (sélection par `paidAt`), donc la reprise n'aurait
    // AUCUNE ligne où aller — elle serait perdue en silence et la
    // sous-déclaration resterait entière pour ce cas précis.
    const r = computeTaxReport([], [], [repriseEvt('o_mai', 11498)]);
    expect(r.summary.repriseHorsPeriodeCents).toBe(11498);
    expect(r.summary.totalSubtotalCents).toBe(10000);
    expect(r.summary.totalTaxCents).toBe(1498);
    expect(r.summary.totalChargedCents).toBe(11498);
    // …et la taxe est ventilée sur la province de la commande d'origine.
    expect(r.summary.gstCents + r.summary.qstCents).toBe(1498);
  });

  it('reprise PARTIELLE hors période → assiette reprise au prorata', () => {
    const r = computeTaxReport([], [], [repriseEvt('o_mai', 5749)]); // la moitié
    expect(r.summary.totalSubtotalCents).toBe(5000);
    expect(r.summary.totalTaxCents).toBe(749);
  });

  it('reprise sans montant lisible → n’invente aucune assiette', () => {
    const r = computeTaxReport([], [], [
      { orderId: 'o_mai', data: JSON.stringify({ refundId: 're_1' }), order: repriseEvt('o_mai', 1).order },
    ]);
    expect(r.summary.repriseCents).toBe(0);
    expect(r.summary.totalSubtotalCents).toBe(0);
  });

  it('reprise sans commande jointe → comptée au total, sans toucher l’assiette', () => {
    // On sait que de l'argent est revenu, mais on ne peut pas l'attribuer.
    const r = computeTaxReport([], [], [repriseEvt('o_perdue', 11498, 're_x', null)]);
    expect(r.summary.repriseCents).toBe(11498);
    expect(r.summary.totalSubtotalCents).toBe(0);
  });

  it('deux démentis DISTINCTS sur la même commande → additionnés', () => {
    const r = computeTaxReport([], [], [
      repriseEvt('o_mai', 6000, 're_a'),
      repriseEvt('o_mai', 5498, 're_b'),
    ]);
    expect(r.summary.repriseHorsPeriodeCents).toBe(11498);
    expect(r.summary.totalChargedCents).toBe(11498);
  });

  it('⚠️ le MÊME démenti livré DEUX FOIS ne compte qu’une fois', () => {
    // Le garde d'idempotence de `charge.refund.updated` est une
    // lecture-puis-écriture NON atomique, et le rejeu depuis /admin/webhooks
    // court-circuite la dédup du webhook : deux `REFUND_FAILED` pour un même
    // `re_…` sont atteignables.
    //
    // ⚠️ CE TEST REMPLACE UN TEST QUI VERROUILLAIT LE DÉFAUT. Le premier jet
    // passait deux fois le même `refundId` en AFFIRMANT qu'ils devaient
    // s'additionner — et le plafond `Math.min(1, …)` rendait le doublon
    // silencieux : sur un remboursement PARTIEL de 445 $ démenti en double,
    // l'assiette reprenait 890 $ et Plio remettait 58 $ de taxe de trop.
    const r = computeTaxReport([], [], [
      repriseEvt('o_mai', 5749, 're_dup'),
      repriseEvt('o_mai', 5749, 're_dup'),
    ]);
    expect(r.summary.repriseHorsPeriodeCents).toBe(5749);
    expect(r.summary.totalSubtotalCents).toBe(5000);
  });

  it('⚠️ SYMÉTRIE : un remboursement sur commande HORS période RÉDUIT l’assiette', () => {
    // Commande payée le 28 mars, remboursée le 3 avril. Le rapport d'avril ne
    // contient pas la commande, donc un jet précédent ne soustrayait RIEN —
    // pendant qu'il ajoutait les reprises sans condition. La taxe se
    // retrouvait déclarée DEUX FOIS sur cette commande.
    const r = computeTaxReport([], [refundEvt(11498)], []);
    expect(r.summary.totalSubtotalCents).toBe(-10000);
    expect(r.summary.totalTaxCents).toBe(-1498);
    expect(r.summary.gstCents + r.summary.qstCents).toBe(-1498);
  });

  it('émis ET démenti hors période, même montant → ajustement NUL', () => {
    const r = computeTaxReport([], [refundEvt(11498)], [repriseEvt('o1', 11498)]);
    expect(r.summary.totalSubtotalCents).toBe(0);
    expect(r.summary.totalTaxCents).toBe(0);
  });

  it('⚠️ l’invariant total = somme des lignes tient sur les ajustements (balayage)', () => {
    // L'absorption d'arrondi manquait dans la branche d'ajustement. Un
    // premier jet de ce test énumérait cinq montants choisis à la main, tous
    // en QC : AUCUN ne dérivait, et la mutation « absorption retirée »
    // survivait. Le défaut ne se trouve pas en devinant — il se BALAIE.
    //
    // Le CSV imprime le total ET les quatre lignes, que l'admin recopie dans
    // deux formulaires distincts : un écart d'un cent y est visible.
    const provinces = ['QC', 'ON', 'BC', 'AB', 'SK'];
    let derivesTrouvees = 0;
    for (const prov of provinces) {
      for (let sub = 100; sub <= 400000; sub += 877) {
        const taxe = Math.round(sub * 0.14975);
        const cmd = { ...commande, shipProvince: prov, subtotalCents: sub, taxCents: taxe, amountCents: sub + taxe };
        const r = computeTaxReport([], [], [
          { orderId: 'x', data: JSON.stringify({ refundId: 're_x', amountCents: cmd.amountCents }),
            order: { amountCents: cmd.amountCents, subtotalCents: cmd.subtotalCents, taxCents: cmd.taxCents, shipProvince: prov } },
        ]);
        const somme = r.summary.gstCents + r.summary.pstCents + r.summary.qstCents + r.summary.hstCents;
        if (somme !== r.summary.totalTaxCents) derivesTrouvees++;
        expect(somme).toBe(r.summary.totalTaxCents);
      }
    }
    expect(derivesTrouvees).toBe(0);
  });

  it('une commande CANCELLED n’entre PAS dans l’assiette — garanti par la requête', () => {
    // Le filtre de statut vit dans le `where` (testé dans
    // `refund-dementi-requetes`), pas ici : le helper pur reçoit ce qu'on lui
    // donne. Ce test documente la frontière pour qu'on ne croie pas que le
    // helper protège de ça.
    expect(computeTaxReport([], [], []).summary.totalSubtotalCents).toBe(0);
  });

  it('la reprise ne rend jamais l’assiette négative', () => {
    const r = computeTaxReport([commande], [refundEvt(5000)], [repriseEvt('o1', 20000)]);
    expect(r.summary.totalSubtotalCents).toBe(10000);
    expect(r.summary.totalSubtotalCents).toBeGreaterThanOrEqual(0);
  });
});
