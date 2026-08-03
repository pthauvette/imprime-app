/**
 * Libellés FR des options — source unique.
 *
 * Deux propriétés comptent ici, et elles tirent en sens opposés :
 *   1. traduire ce qui est traduisible SANS RISQUE (options de service) ;
 *   2. ne JAMAIS toucher aux identités produit (papiers, finitions) — une
 *      traduction approximative y ferait acheter autre chose que ce qui sera
 *      imprimé.
 * La moitié des tests protège donc le NON-TRADUIT.
 */
import { describe, it, expect } from 'vitest';
import { groupLabelFr, optionValueFr, optionValueOrRaw } from '@/lib/products/option-i18n';

describe('groupLabelFr', () => {
  it('traduit les groupes connus', () => {
    expect(groupLabelFr('Turnaround')).toBe('Délai');
    expect(groupLabelFr('size')).toBe('Format');
    expect(groupLabelFr('Bindery')).toBe('Façonnage');
    // Nomme le GROUPE, pas une de ses valeurs.
    expect(groupLabelFr('Round Corners')).toBe('Coins');
  });

  it('traduit enfin « Bundling » — le placeholder se traduisait par lui-même', () => {
    expect(groupLabelFr('Bundling')).toBe('Conditionnement');
  });

  it('`Stock` dépend du PRODUIT : papier ou nombre de faces', () => {
    // Un libellé fixe est faux la moitié du temps — le MCP affichait « Faces »
    // sur de vrais groupes papier.
    expect(groupLabelFr('Stock', ['14pt', '16pt'])).toBe('Papier');
    expect(groupLabelFr('Stock', ['14PT Printed 1 Side (4/0)', '14PT Printed 2 Sides (4/4)']))
      .toBe('Impression recto / recto-verso');
    expect(groupLabelFr('Stock')).toBe('Papier'); // sans indice → papier
  });

  it('un groupe inconnu garde sa clé, jamais un libellé inventé', () => {
    expect(groupLabelFr('Groupe Sinalite Inédit')).toBe('Groupe Sinalite Inédit');
  });
});

describe('optionValueFr — options de SERVICE', () => {
  it('traduit les délais en gardant les chiffres INTACTS', () => {
    // On traduit l'unité, on ne recalcule aucun délai : se tromper ici ferait
    // rater une date de campagne.
    expect(optionValueFr('Turnaround', 'Next Business Day')).toBe('Jour ouvrable suivant');
    expect(optionValueFr('Turnaround', '2 - 3 Business Days')).toBe('2–3 jours ouvrables');
    expect(optionValueFr('Turnaround', '4 - 5 Business Days')).toBe('4–5 jours ouvrables');
    expect(optionValueFr('Turnaround', '1 Business Day')).toBe('1 jour ouvrable');
    expect(optionValueFr('Turnaround', '3 Business Days')).toBe('3 jours ouvrables');
  });

  it('traduit le conditionnement, en gardant la taille du paquet', () => {
    expect(optionValueFr('Bundling', 'No bundling - FREE')).toBe('Sans conditionnement — inclus');
    expect(optionValueFr('Bundling', 'Single band - 25s')).toBe('Bande simple — par 25');
    expect(optionValueFr('Bundling', 'Double band - 50s')).toBe('Bande double — par 50');
    expect(optionValueFr('Bundling', 'Shrink Wrap - 100s')).toBe('Emballage rétractable — par 100');
  });

  it('traduit façonnage, fente et oui/non', () => {
    expect(optionValueFr('Bindery', '1.25 Hole and Slit')).toBe('Trou 1,25 po + fente');
    expect(optionValueFr('Business Card Slit', 'Right Side')).toBe('Côté droit');
    expect(optionValueFr('Round Corners', 'YES')).toBe('Oui');
    expect(optionValueFr('Scoring', 'None')).toBe('Aucun');
  });
});

describe('optionValueFr — ce qui doit RESTER en anglais', () => {
  it('ne traduit PAS les noms de papiers', () => {
    // Identité produit : « 14PT Printed 2 Sides (4/4) » désigne un SKU précis.
    for (const nom of ['14PT Printed 2 Sides (4/4)', '16PT Printed 1 Side (4/0)', '100LB Gloss Text']) {
      expect(optionValueFr('Stock', nom)).toBeNull();
      expect(optionValueOrRaw('Stock', nom)).toBe(nom);
    }
  });

  it('ne traduit PAS les noms de finitions — sauf l’absence, non ambiguë', () => {
    expect(optionValueFr('Coating', 'Gloss AQ')).toBeNull();
    expect(optionValueFr('Coating', 'Matte Finish')).toBeNull();
    expect(optionValueFr('Coating', 'No Coating')).toBe('Sans couche');
  });

  it('rend null sur un délai de forme inattendue plutôt que de deviner', () => {
    expect(optionValueFr('Turnaround', 'Rush - call us')).toBeNull();
    expect(optionValueOrRaw('Turnaround', 'Rush - call us')).toBe('Rush - call us');
  });

  it('un groupe inconnu n’est jamais traduit', () => {
    expect(optionValueFr('Groupe Inédit', 'Some Value')).toBeNull();
  });
});
