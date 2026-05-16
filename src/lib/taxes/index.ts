/**
 * Calcul des taxes canadiennes par province (mai 2026).
 *
 * 5 régimes :
 *  • HST seul (5 provinces : ON, NB, NL, NS, PE) — un seul taux fédéral+provincial combiné
 *  • TPS + TVQ (QC) — TPS 5% fédéral + TVQ 9.975% Québec
 *  • GST + PST (BC, SK, MB) — GST 5% fédéral + PST/RST provincial
 *  • GST seul (AB + 3 territoires NT/NU/YT) — 5% fédéral uniquement
 *
 * Plio ne facture pas les territoires hors CA (export US = différent).
 */

import type { CaProvince } from '../sinalite/types';

export interface TaxLine {
  /** Identifiant interne (gst, pst, hst, qst). */
  code: 'gst' | 'pst' | 'hst' | 'qst';
  /** Affichage (« TPS (5 %) — Canada »). */
  label: string;
  /** Taux décimal (0.05 = 5 %). */
  rate: number;
  /** Montant calculé en CAD, arrondi à 2 décimales. */
  amount: number;
}

export interface TaxBreakdown {
  /** Lignes de taxes applicables (1 à 2 selon la province). */
  lines: TaxLine[];
  /** Somme des taxes en CAD. */
  total: number;
  /** Taux combiné pour affichage (ex. 0.14975 pour QC). */
  combinedRate: number;
}

const HST_PROVINCES: Record<string, number> = {
  ON: 0.13,   // 13 % (5 GST + 8 PST harmonisés)
  NB: 0.15,
  NL: 0.15,
  NS: 0.15,
  PE: 0.15,
};

const PST_PROVINCES: Record<string, number> = {
  BC: 0.07,   // PST/RST
  SK: 0.06,
  MB: 0.07,
};

const GST_RATE = 0.05;

export function computeTax(subtotal: number, province: CaProvince): TaxBreakdown {
  const lines: TaxLine[] = [];

  if (province in HST_PROVINCES) {
    const rate = HST_PROVINCES[province]!;
    const amount = round2(subtotal * rate);
    lines.push({
      code: 'hst',
      label: `HST (${(rate * 100).toFixed(0)} %) — ${provinceName(province)}`,
      rate,
      amount,
    });
  } else if (province === 'QC') {
    const gstAmount = round2(subtotal * GST_RATE);
    const qstRate = 0.09975;
    const qstAmount = round2(subtotal * qstRate);
    lines.push({
      code: 'gst',
      label: 'TPS (5 %) — Canada',
      rate: GST_RATE,
      amount: gstAmount,
    });
    lines.push({
      code: 'qst',
      label: 'TVQ (9,975 %) — Québec',
      rate: qstRate,
      amount: qstAmount,
    });
  } else if (province in PST_PROVINCES) {
    const pstRate = PST_PROVINCES[province]!;
    lines.push({
      code: 'gst',
      label: 'TPS (5 %) — Canada',
      rate: GST_RATE,
      amount: round2(subtotal * GST_RATE),
    });
    lines.push({
      code: 'pst',
      label: `PST (${(pstRate * 100).toFixed(0)} %) — ${provinceName(province)}`,
      rate: pstRate,
      amount: round2(subtotal * pstRate),
    });
  } else {
    // AB + territoires (NT, NU, YT) → GST seul
    lines.push({
      code: 'gst',
      label: 'TPS (5 %) — Canada',
      rate: GST_RATE,
      amount: round2(subtotal * GST_RATE),
    });
  }

  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  const combinedRate = lines.reduce((sum, l) => sum + l.rate, 0);

  return { lines, total, combinedRate };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const PROVINCE_NAMES: Record<CaProvince, string> = {
  AB: 'Alberta',
  BC: 'Colombie-Britannique',
  MB: 'Manitoba',
  NB: 'Nouveau-Brunswick',
  NL: 'Terre-Neuve-et-Labrador',
  NS: 'Nouvelle-Écosse',
  NT: 'Territoires du Nord-Ouest',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Île-du-Prince-Édouard',
  QC: 'Québec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

export function provinceName(code: CaProvince): string {
  return PROVINCE_NAMES[code] ?? code;
}
