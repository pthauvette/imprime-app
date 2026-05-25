/**
 * Tests pour les helpers extraits Round 37 #5 :
 *   - formatCents() (src/lib/format.ts)
 *   - STATUS_LABELS / STATUS_CLASS / statusLabel() (src/lib/orders/status-labels.ts)
 *
 * Pin la sémantique pour empêcher les régressions sur les callers
 * (48+ sites qui formatageaient inline, 7 fichiers qui dupliquaient
 * les labels).
 */

import { describe, it, expect } from 'vitest';
import { formatCents, formatCurrency } from '@/lib/format';
import { STATUS_LABELS, STATUS_CLASS, statusLabel } from '@/lib/orders/status-labels';

describe('formatCents (Round 37 #5)', () => {
  // Intl.NumberFormat fr-CA utilise U+202F (narrow no-break space) entre
  // nombre et symbole. On utilise regex pour matcher peu importe le space.
  it('1234 cents → 12,34 $ en fr-CA (default)', () => {
    expect(formatCents(1234)).toMatch(/^12,34\s\$$/);
  });

  it('1234 cents → $12.34 en en-CA', () => {
    expect(formatCents(1234, 'en-CA')).toBe('$12.34');
  });

  it('0 cents → 0,00 $', () => {
    expect(formatCents(0)).toMatch(/^0,00\s\$$/);
  });

  it('cohérence avec formatCurrency : formatCents(c) === formatCurrency(c/100)', () => {
    expect(formatCents(1234)).toBe(formatCurrency(12.34));
    expect(formatCents(99)).toBe(formatCurrency(0.99));
    expect(formatCents(100000)).toBe(formatCurrency(1000));
  });

  it('grosse somme : 12 345 678 cents → 123 456,78 $', () => {
    const result = formatCents(12_345_678);
    expect(result).toMatch(/123.456,78\s\$/);
  });

  it('négatif (refund display) → -5,00 $', () => {
    expect(formatCents(-500)).toMatch(/^-5,00\s\$$/);
  });
});

describe('STATUS_LABELS (Round 37 #5)', () => {
  it('couvre les 8 statuses canoniques OrderStatus', () => {
    expect(STATUS_LABELS.PENDING).toBe('En attente');
    expect(STATUS_LABELS.PAID).toBe('Payée');
    expect(STATUS_LABELS.SUBMITTED).toBe('Soumise');
    expect(STATUS_LABELS.IN_PRODUCTION).toBe('En production');
    expect(STATUS_LABELS.SHIPPED).toBe('Expédiée');
    expect(STATUS_LABELS.DELIVERED).toBe('Livrée');
    expect(STATUS_LABELS.CANCELLED).toBe('Annulée');
    expect(STATUS_LABELS.FAILED).toBe('Échec');
  });

  it('STATUS_CLASS aligné 1:1 avec STATUS_LABELS', () => {
    const labelKeys = Object.keys(STATUS_LABELS).sort();
    const classKeys = Object.keys(STATUS_CLASS).sort();
    expect(classKeys).toEqual(labelKeys);
  });

  it('statusLabel() — connu retourne label', () => {
    expect(statusLabel('PENDING')).toBe('En attente');
    expect(statusLabel('DELIVERED')).toBe('Livrée');
  });

  it('statusLabel() — inconnu retourne raw (defensive)', () => {
    expect(statusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
    expect(statusLabel('')).toBe('');
  });

  it('chaque label FR n\'est PAS vide string', () => {
    for (const key of Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>) {
      expect(STATUS_LABELS[key]).not.toBe('');
      expect(STATUS_LABELS[key].length).toBeGreaterThan(0);
    }
  });
});
