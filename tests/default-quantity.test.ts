/**
 * Tests pour pickDefaultQuantityOption — finding [18].
 *
 * Lock-in : le palier par défaut est choisi par VALEUR (le plus proche de la
 * cible), jamais par POSITION — deux listes de paliers de formes différentes
 * doivent converger vers un ancrage prix cohérent.
 */

import { describe, it, expect } from 'vitest';
import { pickDefaultQuantityOption, DEFAULT_TARGET_QTY } from '@/lib/products/default-quantity';

const opt = (id: number, name: string) => ({ id, name });

describe('pickDefaultQuantityOption', () => {
  it('cible atteinte exactement → la retourne', () => {
    const opts = [opt(1, '25'), opt(2, '250'), opt(3, '500'), opt(4, '1000')];
    expect(pickDefaultQuantityOption(opts)?.name).toBe('500');
  });

  it('cible absente → le palier le plus proche numériquement', () => {
    const opts = [opt(1, '100'), opt(2, '400'), opt(3, '750')];
    // |400-500|=100 < |750-500|=250 < |100-500|=400
    expect(pickDefaultQuantityOption(opts)?.name).toBe('400');
  });

  it("liste vide → undefined", () => {
    expect(pickDefaultQuantityOption([])).toBeUndefined();
  });

  it('une seule option → la retourne peu importe sa valeur', () => {
    expect(pickDefaultQuantityOption([opt(1, '10000')])?.name).toBe('10000');
  });

  it('ordre d\'entrée indifférent (non trié, pas de tie exact)', () => {
    const sorted = [opt(1, '25'), opt(2, '400'), opt(3, '800')];
    const shuffled = [opt(3, '800'), opt(1, '25'), opt(2, '400')];
    expect(pickDefaultQuantityOption(sorted)?.id).toBe(pickDefaultQuantityOption(shuffled)?.id);
    expect(pickDefaultQuantityOption(sorted)?.name).toBe('400');
  });

  // Finding [18] — le bug réel : deux listes de FORME différente convergent
  // vers un ancrage prix cohérent (pas 75u vs 750u selon la position).
  it("deux listes de forme différente convergent vers le MÊME ordre de grandeur (≠ ancien bug 6×)", () => {
    const listA = [opt(1, '25'), opt(2, '50'), opt(3, '75'), opt(4, '100'), opt(5, '250'), opt(6, '500'), opt(7, '1000')];
    const listB = [opt(1, '100'), opt(2, '250'), opt(3, '500'), opt(4, '750'), opt(5, '1000')];
    const a = Number(pickDefaultQuantityOption(listA)!.name);
    const b = Number(pickDefaultQuantityOption(listB)!.name);
    expect(a).toBe(500);
    expect(b).toBe(500);
  });

  it('cible personnalisée respectée', () => {
    const opts = [opt(1, '10'), opt(2, '100'), opt(3, '1000')];
    expect(pickDefaultQuantityOption(opts, 100)?.name).toBe('100');
  });

  it('DEFAULT_TARGET_QTY vaut 500 (ancre le contrat)', () => {
    expect(DEFAULT_TARGET_QTY).toBe(500);
  });
});
