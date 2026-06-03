/**
 * variant-key — Audit v2 #4.1.
 *
 * Verrouille le bug funnel : un aller-retour Upload→Quantité réinjecte l'ancien
 * qtyId dans baseOptionIds. Sans nettoyage, la clé de prix contient 2 qtyId →
 * absente de l'index → prix « — », bouton Continuer désactivé.
 */

import { describe, it, expect } from 'vitest';
import { cleanBaseOptionIds, buildVariantKey } from '@/lib/products/variant-key';

const QTY = new Set([78, 79, 80]); // ids du groupe qty
const TURN = new Set([107, 108]); // ids du groupe turnaround

describe('cleanBaseOptionIds', () => {
  it('retire les IDs qty ET turnaround parasites de la base', () => {
    // base réinjectée par upload : format/papier/finition + ancien qty(78) + turnaround(107)
    const base = [4, 30, 224, 78, 107];
    expect(cleanBaseOptionIds(base, QTY, TURN)).toEqual([4, 30, 224]);
  });

  it('base déjà propre → inchangée', () => {
    expect(cleanBaseOptionIds([4, 30, 224], QTY, TURN)).toEqual([4, 30, 224]);
  });

  it('plusieurs qty parasites → tous retirés', () => {
    expect(cleanBaseOptionIds([4, 78, 79, 30], QTY, TURN)).toEqual([4, 30]);
  });
});

describe('buildVariantKey', () => {
  it('construit une clé triée avec UN SEUL qtyId (le courant), pas l\'ancien', () => {
    // base nettoyée + nouveau qty 80 + turnaround 108
    const cleaned = cleanBaseOptionIds([4, 30, 224, 78, 107], QTY, TURN); // [4,30,224]
    const key = buildVariantKey(cleaned, 80, 108);
    expect(key).toBe('4-30-80-108-224');
    // l'ancien qty (78) et l'ancien turnaround (107) ne sont PAS dans la clé
    expect(key).not.toContain('78');
    expect(key).not.toContain('107');
  });

  it('sans turnaround → clé sans turnaround', () => {
    expect(buildVariantKey([4, 30], 80)).toBe('4-30-80');
  });

  it('tri numérique stable (pas lexicographique)', () => {
    // 9 < 80 numériquement ; un tri lexicographique mettrait "80" avant "9"
    expect(buildVariantKey([80, 9], 30)).toBe('9-30-80');
  });
});
