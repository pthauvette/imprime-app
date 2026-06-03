/**
 * wrapFocusIndex — Audit v2 #9.1 (cœur du focus-trap des modals).
 *
 * Le focus ne doit jamais sortir d'un modal : Tab sur le dernier → premier,
 * Shift+Tab sur le premier → dernier, au milieu → pas de wrap (natif).
 */

import { describe, it, expect } from 'vitest';
import { wrapFocusIndex } from '@/lib/a11y/focus-trap';

describe('wrapFocusIndex (#9.1)', () => {
  it('Tab sur le DERNIER élément → wrap au premier (0)', () => {
    expect(wrapFocusIndex(2, 3, false)).toBe(0);
  });

  it('Shift+Tab sur le PREMIER élément → wrap au dernier', () => {
    expect(wrapFocusIndex(0, 3, true)).toBe(2);
  });

  it('Tab au milieu → null (comportement natif, pas de wrap)', () => {
    expect(wrapFocusIndex(1, 3, false)).toBeNull();
  });

  it('Shift+Tab au milieu → null', () => {
    expect(wrapFocusIndex(1, 3, true)).toBeNull();
  });

  it('focus hors liste (−1) → entrée à la 1re position en avant', () => {
    expect(wrapFocusIndex(-1, 3, false)).toBe(0);
  });

  it('focus hors liste (−1) + Shift → entrée à la dernière position', () => {
    expect(wrapFocusIndex(-1, 3, true)).toBe(2);
  });

  it('liste vide → null (rien à trapper)', () => {
    expect(wrapFocusIndex(0, 0, false)).toBeNull();
    expect(wrapFocusIndex(-1, 0, true)).toBeNull();
  });

  it('un seul élément : Tab et Shift+Tab restent dessus (wrap sur lui-même)', () => {
    expect(wrapFocusIndex(0, 1, false)).toBe(0);
    expect(wrapFocusIndex(0, 1, true)).toBe(0);
  });
});
