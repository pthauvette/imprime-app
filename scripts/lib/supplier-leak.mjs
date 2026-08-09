/**
 * Détection de fuites « jargon fournisseur / anglais résiduel » — logique PURE.
 *
 * Séparée de `measure-supplier-leak.mjs` pour être testable : un scanner qu'on
 * n'a jamais vu DÉTECTER quoi que ce soit n'est qu'un feu vert décoratif. Les
 * tests (`tests/supplier-leak.test.ts`) rejouent les chaînes réellement
 * trouvées en production en 2026-08, et vérifient aussi ce qui doit rester
 * TOLÉRÉ — les identités produit.
 */

/**
 * Motifs de fuite. Chacun cite le cas RÉEL qui l'a motivé — sans ça, un
 * successeur ne peut pas juger s'il est encore pertinent.
 */
export const FUITES = [
  { re: /\(Profit Maximizer\)/i, quoi: 'palier de marge Sinalite (#563 : affiché sur /compare)' },
  { re: /\bBusiness cards? \d+pt\b/i, quoi: 'nom produit Sinalite brut (#542 le remplace par un nom marketing)' },
  { re: /\bNext Business Day\b/i, quoi: 'délai non traduit (#565)' },
  { re: /\b\d+\s*-\s*\d+\s+Business Days?\b/i, quoi: 'délai non traduit (#565)' },
  { re: /\bNo bundling\b/i, quoi: 'conditionnement non traduit (#565)' },
  { re: /\b(Single|Double) band\s*-\s*\d+/i, quoi: 'conditionnement non traduit (#565)' },
  { re: /\bShrink Wrap\s*-\s*\d+/i, quoi: 'conditionnement non traduit (#565)' },
  { re: /\bHole and Slit\b/i, quoi: 'façonnage non traduit (#565)' },
  { re: /\bBundling\b/i, quoi: 'libellé de groupe non traduit (#565 : « Conditionnement »)' },
  // Groupes des brochures / livrets / chemises — invisibles tant que le
  // scanner ne visitait que des cartes et des flyers.
  { re: /\bFold Type\b/i, quoi: 'libellé de groupe non traduit (« Type de pli »)' },
  { re: /Do you have a folding sample\?/i, quoi: 'libellé de groupe non traduit (question en anglais)' },
  { re: /\bInclude Envelopes\b/i, quoi: 'libellé de groupe non traduit (« Enveloppes incluses »)' },
  { re: /\bSpot UV\b/i, quoi: 'libellé de groupe non traduit (« Vernis sélectif »)' },
  { re: /\b(One|Two) sided\b/, quoi: 'valeur de vernis non traduite (« Recto » / « Recto-verso »)' },
  { re: /\b(Long|Short) Edge \/ (Portrait|Landscape)\b/i, quoi: 'valeur de reliure non traduite' },
  { re: /\b(Two Pockets|Inside Right Pocket Only)\b/i, quoi: 'valeur de poches non traduite' },
  { re: /\bSelf Cover\b/i, quoi: 'valeur de couverture non traduite (« Autocouverture »)' },
];

/**
 * Toléré — décisions explicites, pas des oublis. Vérifié AVANT les motifs de
 * fuite : une occurrence tolérée ne doit pas déclencher d'alerte.
 */
export const TOLERE = [
  /\d+PT Printed \d+ Sides? \(\d\/\d\)/i,  // identité produit : le SKU exact
  /\b(Gloss AQ|Matte Finish|Soft Touch|High Gloss UV)\b/i, // noms de finitions
  /\b(Matte|Soft Touch|Gloss) Lamination \d Sided?\b/i,    // idem, laminations
  // Noms de pliages normalisés — « Tri Fold » ≠ « Z Fold » alors que les deux
  // font trois volets. Une traduction approximative ferait recevoir un dépliant
  // qui ne s'ouvre pas comme prévu. Attendent un glossaire validé par le métier
  // (cf. option-i18n.ts). Retirer cette ligne = décider de les traduire.
  /\b(Half|Tri|Z|Roll|Gate|Double Gate|Double Parallel|Accordion) Fold\b/i,
  /\b(Score and (Tri|Half|Roll|Z|Double Parallel)|Half Fold and Roll|\d Panel [A-Za-z]+ Fold|\d Page Fold|Double Parallel|Gate)\b/i,
];

export function analyser(texte) {
  const trouvees = [];
  for (const { re, quoi } of FUITES) {
    const m = texte.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'));
    if (!m) continue;
    const restantes = m.filter((occ) => !TOLERE.some((t) => t.test(occ)));
    if (restantes.length) trouvees.push({ quoi, exemples: [...new Set(restantes)].slice(0, 3) });
  }
  return trouvees;
}
