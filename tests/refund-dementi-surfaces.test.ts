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

/**
 * ⚠️ LES INVARIANTS STRUCTURELS DU RAPPORT — ceux qui attrapent un défaut sans
 * qu'on ait à l'imaginer.
 *
 * La revue a trouvé que le rapport ne justifiait plus son propre total : les
 * ajustements hors période ne touchaient que `summary`, jamais `rows`. Depuis
 * la symétrie, ces ajustements sont la NORME — tout remboursement qui traverse
 * une frontière de période en produit un. La colonne `total_tax_cents` cessait
 * donc de sommer au « Total tax collected » imprimé juste au-dessus, sur un
 * artefact dont la raison d'être est que le détail justifie le sommaire.
 *
 * Aucun des tests précédents ne pouvait le voir : ils assertaient tous des
 * champs de `summary`.
 */
describe('le détail doit justifier le sommaire', () => {
  const cmdHors = (id: string, prov = 'QC') => ({
    orderId: id,
    data: JSON.stringify({ refundId: `re_${id}`, amountCents: 11498 }),
    order: { amountCents: 11498, subtotalCents: 10000, taxCents: 1498, shipProvince: prov },
  });

  it('Σ lignes === totaux du résumé, avec ajustements dans les deux sens', () => {
    const r = computeTaxReport(
      [commande],
      [refundEvt(3000), cmdHors('o_ancienne')],       // un remboursement hors période
      [cmdHors('o_autre', 'ON')],                      // une reprise hors période
    );
    const somme = (f: (x: typeof r.rows[number]) => number) => r.rows.reduce((a, x) => a + f(x), 0);
    expect(somme((x) => x.totalTaxCents)).toBe(r.summary.totalTaxCents);
    expect(somme((x) => x.subtotalCents)).toBe(r.summary.totalSubtotalCents);
    expect(somme((x) => x.totalChargedCents)).toBe(r.summary.totalChargedCents);
    expect(somme((x) => x.gstCents + x.pstCents + x.qstCents + x.hstCents)).toBe(r.summary.totalTaxCents);
  });

  it('les lignes d’ajustement sont IDENTIFIÉES et sans date', () => {
    // Sans le drapeau, une ligne d'ajustement se lit comme une vente de la
    // période — et son `paid_at` vide passerait pour une donnée manquante.
    const r = computeTaxReport([], [], [cmdHors('o_mai')]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.ajustement).toBe(true);
    expect(r.rows[0]!.paidAt).toBeNull();
  });

  it('une vente ordinaire n’est PAS marquée comme ajustement', () => {
    const r = computeTaxReport([commande], []);
    expect(r.rows[0]!.ajustement).toBeUndefined();
  });
});

describe('assiette NÉGATIVE — la sortie normale d’un trimestre calme', () => {
  it('un gros remboursement tardif rend le total négatif, et une ligne l’explique', () => {
    // Trimestre calme : une commande de 57,49 $, et une commande de 890,00 $
    // du trimestre PRÉCÉDENT remboursée dans celui-ci.
    const petite = { ...commande, id: 'o_petite', subtotalCents: 5000, taxCents: 749, amountCents: 5749 };
    const grosse = {
      orderId: 'o_grosse',
      data: JSON.stringify({ refundId: 're_grosse', amountCents: 89000 }),
      order: { amountCents: 89000, subtotalCents: 77365, taxCents: 11635, shipProvince: 'QC' },
    };
    const r = computeTaxReport([petite], [grosse], []);

    expect(r.summary.totalTaxCents).toBeLessThan(0);
    // ⚠️ CE QUI COMPTE : le montant qui explique le négatif est VISIBLE.
    expect(r.summary.ajustementHorsPeriodeCents).toBe(-89000);
    // …et il a sa ligne, donc la colonne somme toujours.
    expect(r.rows.reduce((a, x) => a + x.totalTaxCents, 0)).toBe(r.summary.totalTaxCents);
    expect(r.rows.filter((x) => x.ajustement)).toHaveLength(1);
  });
});

describe('les compteurs annoncés disent ce qu’ils font', () => {
  it('une reprise annulée par un remboursement égal reste comptée dans « hors période »', () => {
    // Placée après le `continue` de `net === 0`, elle n'y arrivait jamais : le
    // CSV imprimait « Reprises : 889,50 $ / dont hors période : 0 $ », ce qui
    // se lit « toutes portent sur des commandes du rapport ».
    const evt = (kind: 'e' | 'r') => ({
      orderId: 'o_x',
      data: JSON.stringify({ refundId: `re_${kind}`, amountCents: 88950 }),
      order: { amountCents: 88950, subtotalCents: 77365, taxCents: 11585, shipProvince: 'QC' },
    });
    const r = computeTaxReport([], [evt('e')], [evt('r')]);
    expect(r.summary.repriseCents).toBe(88950);
    expect(r.summary.repriseHorsPeriodeCents).toBe(88950);
    expect(r.summary.ajustementHorsPeriodeCents).toBe(0);
  });

  it('⚠️ une reprise SANS refundId est écartée (indédupliquable)', () => {
    // `handleRefundUpdated` en écrit toujours un ; une reprise anonyme ne peut
    // venir que d'une donnée corrompue, et deux occurrences rouvriraient le
    // double-comptage à l'identique.
    const anon = {
      orderId: 'o_x',
      data: JSON.stringify({ amountCents: 44500 }),
      order: { amountCents: 89000, subtotalCents: 77365, taxCents: 11635, shipProvince: 'QC' },
    };
    const r = computeTaxReport([], [], [anon, anon]);
    expect(r.summary.repriseCents).toBe(0);
    expect(r.summary.totalSubtotalCents).toBe(0);
  });
});

describe('sous-total proraté nul — la taxe doit atterrir quelque part', () => {
  it('l’invariant tient même quand computeTax rend zéro', () => {
    // Le garde `totalCalcule > 0` sautait toute la ventilation alors que
    // `totalTaxCents` avait déjà été incrémenté : la taxe entrait dans le
    // total et dans AUCUN code. C'est B4 par une autre porte.
    const r = computeTaxReport([], [], [{
      orderId: 'o_livraison',
      data: JSON.stringify({ refundId: 're_l', amountCents: 1498 }),
      order: { amountCents: 1498, subtotalCents: 0, taxCents: 1498, shipProvince: 'QC' },
    }]);
    expect(r.summary.gstCents + r.summary.pstCents + r.summary.qstCents + r.summary.hstCents)
      .toBe(r.summary.totalTaxCents);
    expect(r.summary.totalTaxCents).toBe(1498);
  });
});
