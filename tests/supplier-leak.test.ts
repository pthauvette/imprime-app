/**
 * Détecteur de fuites « jargon fournisseur / anglais résiduel ».
 *
 * POURQUOI CE FICHIER : le scanner est passé au VERT du premier coup. C'est
 * rassurant et sans valeur — un détecteur qu'on n'a jamais vu détecter est un
 * feu vert décoratif. On lui rejoue donc les chaînes RÉELLEMENT trouvées en
 * production en 2026-08, et surtout on verrouille ce qu'il doit LAISSER passer.
 *
 * Les faux positifs comptent autant que les faux négatifs ici : un scanner qui
 * crie sur « 14PT Printed 2 Sides (4/4) » — identité produit qu'on garde en
 * anglais À DESSEIN — serait désactivé au bout de deux semaines.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error — module .mjs de scripts/, hors du graphe TS de src/
import { analyser } from '../scripts/lib/supplier-leak.mjs';

const detecte = (texte: string): boolean => (analyser(texte) as unknown[]).length > 0;

describe('détecte ce qui a réellement fui en production', () => {
  it('le jargon de marge Sinalite sur /compare (#563)', () => {
    expect(detecte('Business cards 14pt (Profit Maximizer)')).toBe(true);
    expect(detecte('Business Cards 14pt + UV (High Gloss)')).toBe(true);
  });

  it('les délais non traduits (#565)', () => {
    expect(detecte('Délai\nNext Business Day')).toBe(true);
    expect(detecte('Délai\n2 - 3 Business Days')).toBe(true);
    expect(detecte('4 - 5 Business Days')).toBe(true);
  });

  it('les groupes des BROCHURES et LIVRETS — l’angle mort du scanner', () => {
    // Ces dix groupes n'existent que sur brochures / livrets / chemises. Le
    // scanner ne visitait que des cartes et des flyers : il a donc rapporté
    // « aucune fuite » pendant des semaines alors qu'une brochure affichait
    // « Fold Type » et « Do you have a folding sample? » en clair.
    expect(detecte('III. Fold Type')).toBe(true);
    expect(detecte('Do you have a folding sample?')).toBe(true);
    expect(detecte('Include Envelopes')).toBe(true);
    expect(detecte('Spot UV\nOne sided')).toBe(true);
    expect(detecte('Binding\nLong Edge / Portrait')).toBe(true);
    expect(detecte('Pockets\nTwo Pockets')).toBe(true);
    expect(detecte('Cover\nSelf Cover')).toBe(true);
  });

  it('le conditionnement et le façonnage non traduits (#565)', () => {
    expect(detecte('No bundling - FREE')).toBe(true);
    expect(detecte('Single band - 25s')).toBe(true);
    expect(detecte('Shrink Wrap - 100s')).toBe(true);
    expect(detecte('1.25 Hole and Slit')).toBe(true);
    expect(detecte('III. Bundling')).toBe(true);
  });
});

describe('laisse passer ce qui est VOULU', () => {
  it('les identités produit restent en anglais — décision, pas oubli', () => {
    // Traduire un SKU approximativement ferait acheter autre chose que ce qui
    // sera imprimé (cf. option-i18n.ts).
    expect(detecte('Papier\n14PT Printed 2 Sides (4/4)')).toBe(false);
    expect(detecte('Finition\nGloss AQ')).toBe(false);
    expect(detecte('16PT Printed 1 Side (4/0)')).toBe(false);
  });

  it('les NOMS DE PLIS restent tolérés — décision, pas oubli', () => {
    // « Tri Fold » ≠ « Z Fold » alors que les deux font trois volets. Traduire
    // de travers ferait recevoir un dépliant qui ne s'ouvre pas comme prévu.
    for (const pli of ['Half Fold', 'Tri Fold', 'Z Fold', 'Roll Fold', 'Double Parallel',
                       'Score and Tri', '4 Panel Accordion Fold', '8 Page Fold']) {
      expect(detecte(`Type de pli\n${pli}`), `${pli} ne doit PAS être signalé`).toBe(false);
    }
  });

  it('les laminations restent tolérées — ce sont des finitions', () => {
    expect(detecte('Finition\nMatte Lamination 2 Sided')).toBe(false);
    expect(detecte('Lamination\nSoft Touch Lamination 2 Sided')).toBe(false);
  });

  it('une page correctement francisée est propre', () => {
    const recap = [
      'CONFIGURATION COURANTE',
      'Format 8.5 x 3.5',
      'Impression recto / recto-verso Recto-verso',
      'Conditionnement Sans conditionnement — inclus',
      'Façonnage Trou 1,25 po + fente',
      'Délai 4–6 jours ouvrables',
    ].join('\n');
    expect(analyser(recap)).toEqual([]);
  });

  it('ne crie pas sur un texte français ordinaire', () => {
    expect(detecte('Nos cartes de visite 14 pt sont imprimées en 2 à 3 jours ouvrables.')).toBe(false);
  });
});

describe('le rapport dit QUOI et OÙ', () => {
  it('nomme la nature de la fuite et donne des exemples', () => {
    const [f] = analyser('Délai\nNext Business Day') as Array<{ quoi: string; exemples: string[] }>;
    expect(f.quoi).toMatch(/délai/i);
    expect(f.exemples).toContain('Next Business Day');
  });
});
