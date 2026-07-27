import { describe, it, expect } from 'vitest';
import { classifySidedness, isSidednessGroup, sidednessDesc } from '@/lib/products/sidedness';

describe('classifySidedness', () => {
  it('reconnaît les conventions CMJN 4/0 et 4/4', () => {
    expect(classifySidedness('4/0')).toBe('single');
    expect(classifySidedness('4/4')).toBe('double');
    expect(classifySidedness(' 4 / 4 ')).toBe('double');
  });

  it('reconnaît "Sided" sous ses variantes', () => {
    expect(classifySidedness('1 Sided')).toBe('single');
    expect(classifySidedness('2 Sided')).toBe('double');
    expect(classifySidedness('Single Sided')).toBe('single');
    expect(classifySidedness('Double-Sided')).toBe('double');
    expect(classifySidedness('One Sided')).toBe('single');
    expect(classifySidedness('Two Sided')).toBe('double');
  });

  it('un vrai nom de papier ne matche rien', () => {
    expect(classifySidedness('14pt Coated')).toBeNull();
    expect(classifySidedness('16pt Soft Touch')).toBeNull();
    expect(classifySidedness('Kraft')).toBeNull();
  });

  // finding [23] — vérifié EN DIRECT contre un vrai produit Sinalite
  // (Business Cards, productId=1) : le nom réel n'est PAS "4/0" nu, mais
  // englobé dans une description complète. Les patterns d'origine (ancrés)
  // ne matchaient PAS ce format réel — bug silencieux découvert en testant.
  it('nom RÉEL Sinalite complet — "14PT Printed N Side(s) (4/X)"', () => {
    expect(classifySidedness('14PT Printed 1 Side (4/0)')).toBe('single');
    expect(classifySidedness('14PT Printed 2 Sides (4/4)')).toBe('double');
  });
});

describe('isSidednessGroup', () => {
  it('groupe recto/verso pur → true', () => {
    expect(isSidednessGroup(['1 Sided', '2 Sided'])).toBe(true);
    expect(isSidednessGroup(['4/0', '4/4'])).toBe(true);
  });

  it('groupe papier réel → false (jamais reclassé)', () => {
    expect(isSidednessGroup(['14pt Coated', '16pt Soft Touch', 'Kraft'])).toBe(false);
  });

  it('groupe MIXTE (un seul nom matche) → false — on préfère rater un cas que casser un vrai papier', () => {
    expect(isSidednessGroup(['14pt Coated', '2 Sided'])).toBe(false);
  });

  it('moins de 2 options → false', () => {
    expect(isSidednessGroup(['1 Sided'])).toBe(false);
    expect(isSidednessGroup([])).toBe(false);
  });
});

describe('sidednessDesc', () => {
  it('décrit distinctement recto vs recto-verso (pas la même phrase pour les deux)', () => {
    expect(sidednessDesc('single')).not.toBe(sidednessDesc('double'));
  });
});
