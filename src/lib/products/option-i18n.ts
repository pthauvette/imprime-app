/**
 * Libellés FR des groupes et valeurs d'options Sinalite — SOURCE UNIQUE.
 *
 * POURQUOI (audit 2026-08). Deux problèmes distincts, mesurés :
 *
 * 1. **45 % des valeurs sont en anglais.** Sur le catalogue réel : 95 des 211
 *    valeurs d'options distinctes (hors quantités) contiennent un mot anglais,
 *    affichées à un client québécois sur le chemin d'achat — « Next Business
 *    Day », « 2 - 3 Business Days », « No bundling - FREE », « Shrink Wrap -
 *    100s », « BC Perf Hole and Slit ». La page /about promet pourtant
 *    « service bilingue, jamais traduit à la machine ».
 *
 * 2. **Le dictionnaire existait en TROIS exemplaires divergents** :
 *    `ConfigureClient.tsx` (`friendlyLabel`), `option-labels.ts`
 *    (`GROUP_LABELS`) et `mcp/tools/configure.ts` (`groupLabel`). Résultat
 *    visible : le même groupe s'affichait « Coins arrondis » au configurateur
 *    et « Coins » à l'écran de PAIEMENT ; `Stock` valait « Papier » sur le site
 *    et « Faces » côté MCP. Le docstring d'`option-labels.ts` justifiait même
 *    la copie (« le faire dépendre d'un fichier UI serait un couplage
 *    superflu ») — c'est ce raisonnement qui a produit la divergence.
 *
 * ⚠️ PÉRIMÈTRE LIMITÉ AUX OPTIONS DE SERVICE.
 * On traduit ce qui décrit une PRESTATION (délai, conditionnement, façonnage,
 * oui/non) : énumérations fermées, grammaire régulière, aucun risque de
 * travestir le produit. On NE touche PAS aux noms de papiers et finitions
 * (« 14PT Printed 2 Sides (4/4) », « Gloss AQ ») — ce sont des identités
 * produit, et une traduction approximative y ferait acheter autre chose que ce
 * qui sera imprimé. Ces noms relèvent du chantier contenu, avec les libellés
 * déjà curés de `virtual-products.ts` et `marketing-names.ts`.
 *
 * Toute valeur non reconnue retombe sur le nom brut — jamais de devinette.
 *
 * ⚠️ LES 16 NOMS DE PLIS RESTENT EN ANGLAIS, ET C'EST UNE DÉCISION.
 * `Fold Type` propose « Half Fold », « Tri Fold », « Z Fold », « Roll Fold »,
 * « Gate », « Double Parallel », « Score and Tri »… Ce sont des noms de pliages
 * NORMALISÉS, et deux d'entre eux peuvent avoir le même nombre de volets tout
 * en produisant un objet différent (« Tri Fold » ≠ « Z Fold »). Se tromper de
 * terme, c'est faire recevoir au client un dépliant qui ne s'ouvre pas comme il
 * l'imaginait — exactement le risque qui fait qu'on ne traduit pas les papiers.
 *
 * ✅ TRANCHÉ PAR PATRICK LE 2026-08-10 : « garder en anglais ». Ce n'est plus
 * une attente de glossaire, c'est la position retenue. Le libellé du GROUPE
 * reste traduit (« Type de pli »), les 16 valeurs restent telles quelles.
 * Quiconque voudrait rouvrir le sujet doit d'abord obtenir les termes que les
 * clients de l'atelier reconnaissent — pas les dériver.
 */

import { isSidednessGroup, SIDEDNESS_LABEL } from './sidedness';

const GROUPES: Record<string, string> = {
  size: 'Format',
  Stock: 'Papier',
  Coating: 'Finition',
  Turnaround: 'Délai',
  // « Coins » et non « Coins arrondis » : le libellé nomme le GROUPE, pas l'une
  // de ses deux valeurs (Carrés / Coins arrondis). Le site disait « Coins
  // arrondis » même quand l'option choisie était « Carrés ».
  'Round Corners': 'Coins',
  'Rounded Corners': 'Coins',
  Scoring: 'Pliage (rainage)',
  Folding: 'Pliage',
  Color: 'Couleur',
  Bindery: 'Façonnage',
  // Se traduisait… par « Bundling ». Le placeholder a atteint la production.
  Bundling: 'Conditionnement',
  'Business Card Slit': 'Fente porte-carte',
  'Foil Color': 'Couleur du foil',
  // Groupes découverts en 2026-08 sur les BROCHURES et LIVRETS — familles que
  // ma mesure de #565 avait bien listées mais que mon scanner ne visitait pas,
  // d'où l'impression que le travail était fini. Cf. la note en fin de fichier.
  'Fold Type': 'Type de pli',
  'Spot UV': 'Vernis sélectif',
  'Do you have a folding sample?': 'As-tu un échantillon de pliage ?',
  'Include Envelopes': 'Enveloppes incluses',
  Dimensions: 'Dimensions',
  Cover: 'Couverture',
  Binding: 'Reliure',
  Pockets: 'Poches',
  Finishing: 'Finition',
  Lamination: 'Lamination',
};

/**
 * Libellé FR d'un groupe. Passer `optionNames` quand on les a : `Stock` encode
 * SELON LE PRODUIT le papier ou le nombre de faces, et un libellé fixe est
 * donc faux la moitié du temps (le MCP affichait « Faces » sur de vrais
 * groupes papier).
 */
export function groupLabelFr(group: string, optionNames?: readonly string[]): string {
  if (group === 'Stock' && optionNames && isSidednessGroup([...optionNames])) {
    return SIDEDNESS_LABEL;
  }
  return GROUPES[group] ?? group;
}

/**
 * Libellé FR d'UNE valeur, ou `null` si on ne sait pas la traduire sûrement —
 * l'appelant affiche alors le nom brut.
 */
export function optionValueFr(group: string, nom: string): string | null {
  const v = nom.trim();

  // ── Oui / Non / Aucun ────────────────────────────────────────────────────
  if (/^yes$/i.test(v)) return 'Oui';
  if (/^no$/i.test(v)) return 'Non';
  if (/^none$/i.test(v)) return 'Aucun';

  // ── Délais ───────────────────────────────────────────────────────────────
  // Le chiffre est repris TEL QUEL : on traduit l'unité, on ne recalcule aucun
  // délai — se tromper ici ferait rater une date de campagne.
  if (group === 'Turnaround') {
    if (/^next\s+business\s+day$/i.test(v)) return 'Jour ouvrable suivant';
    if (/^same\s+business\s+day$/i.test(v)) return 'Le jour même';
    const plage = v.match(/^(\d+)\s*[-–]\s*(\d+)\s+business\s+days?$/i);
    if (plage) return `${plage[1]}–${plage[2]} jours ouvrables`;
    const seul = v.match(/^(\d+)\s+business\s+days?$/i);
    if (seul) {
      const n = Number(seul[1]);
      return `${n} jour${n > 1 ? 's' : ''} ouvrable${n > 1 ? 's' : ''}`;
    }
    return null;
  }

  // ── Conditionnement ──────────────────────────────────────────────────────
  // « Single band - 25s » = bandes par paquets de 25.
  if (group === 'Bundling') {
    if (/^no\s+bundling/i.test(v)) return 'Sans conditionnement — inclus';
    const m = v.match(/^(single band|double band|shrink wrap)\s*-\s*(\d+)s?$/i);
    if (m) {
      const type = m[1]!.toLowerCase();
      const libelle =
        type === 'single band' ? 'Bande simple'
        : type === 'double band' ? 'Bande double'
        : 'Emballage rétractable';
      return `${libelle} — par ${m[2]}`;
    }
    return null;
  }

  // ── Fente porte-carte ────────────────────────────────────────────────────
  if (group === 'Business Card Slit') {
    if (/^right\s+side$/i.test(v)) return 'Côté droit';
    if (/^left\s+side$/i.test(v)) return 'Côté gauche';
    return null;
  }

  // ── Façonnage (accroche-portes) ──────────────────────────────────────────
  if (group === 'Bindery') {
    if (/^1\.25\s+hole\s+and\s+slit$/i.test(v)) return 'Trou 1,25 po + fente';
    if (/^bc\s+perf\s+hole\s+and\s+slit$/i.test(v)) return 'Trou + fente + perforation carte';
    return null;
  }

  // ── Vernis sélectif : recto / recto-verso, même sémantique que les faces ──
  if (group === 'Spot UV') {
    if (/^one\s+sided$/i.test(v)) return 'Recto';
    if (/^two\s+sided$/i.test(v)) return 'Recto-verso';
    return null;
  }

  // ── Reliure : géométrie pure, aucune ambiguïté produit ───────────────────
  if (group === 'Binding') {
    if (/^long\s+edge\s*\/\s*portrait$/i.test(v)) return 'Bord long / Portrait';
    if (/^short\s+edge\s*\/\s*landscape$/i.test(v)) return 'Bord court / Paysage';
    return null;
  }

  // ── Poches (chemises de présentation) : géométrie ────────────────────────
  if (group === 'Pockets') {
    if (/^two\s+pockets$/i.test(v)) return 'Deux poches';
    if (/^inside\s+right\s+pocket\s+only$/i.test(v)) return 'Poche intérieure droite seulement';
    return null;
  }

  // ── Couverture : « Self Cover » décrit une CONSTRUCTION (même papier que
  //    l'intérieur), pas un papier — traduisible sans risque. « 14pt Cover »
  //    NOMME un papier : reste brut.
  if (group === 'Cover' && /^self\s+cover$/i.test(v)) return 'Autocouverture (même papier que l’intérieur)';

  // ── Finition : uniquement l'ABSENCE, sans ambiguïté. Les noms de finitions
  //    (« Gloss AQ », « Matte Finish », « Matte Lamination 2 Sided ») restent
  //    bruts — cf. l'avertissement de périmètre en tête de fichier.
  if (group === 'Coating' && /^no\s+coating$/i.test(v)) return 'Sans couche';

  return null;
}

/** Raccourci : la valeur traduite si on sait, sinon le nom brut. */
export function optionValueOrRaw(group: string, nom: string): string {
  return optionValueFr(group, nom) ?? nom;
}
