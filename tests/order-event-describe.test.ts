/**
 * Tests pour describeEvent — parsing du payload OrderEvent en texte
 * friendly. Round 13 #4.
 */

import { describe, it, expect } from 'vitest';
import { describeEvent, KIND_LABELS } from '@/lib/orders/event-describe';

describe('describeEvent', () => {
  it('returns null si data null', () => {
    expect(describeEvent({ kind: 'PAYMENT_SUCCEEDED', data: null })).toBeNull();
  });

  it('returns null si JSON invalide', () => {
    expect(describeEvent({ kind: 'REFUND_ISSUED', data: 'not-json' })).toBeNull();
  });

  describe('SINALITE_STATUS_CHANGED', () => {
    it('formate status + tracking', () => {
      const out = describeEvent({
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({ status: 'SHIPPED', trackingNumber: '1Z123ABC', carrier: 'UPS' }),
      });
      expect(out).toContain('Statut : SHIPPED');
      expect(out).toContain('Tracking : UPS 1Z123ABC');
    });

    it('garde juste le status si pas de tracking', () => {
      const out = describeEvent({
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({ status: 'IN_PRODUCTION' }),
      });
      expect(out).toBe('Statut : IN_PRODUCTION');
    });

    it('default carrier "Carrier" si tracking sans carrier', () => {
      const out = describeEvent({
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({ status: 'SHIPPED', trackingNumber: 'XYZ789' }),
      });
      expect(out).toContain('Tracking : Carrier XYZ789');
    });

    it('ancien format imbriqué {payload:{...}} (commandes déjà en base avant le fix) reste lisible', () => {
      const out = describeEvent({
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({ payload: { status: 'SHIPPED', trackingNumber: '1Z123ABC', carrier: 'UPS' } }),
      });
      expect(out).toContain('Statut : SHIPPED');
      expect(out).toContain('Tracking : UPS 1Z123ABC');
    });
  });

  describe('REFUND_ISSUED', () => {
    it('formate amount + reason', () => {
      const out = describeEvent({
        kind: 'REFUND_ISSUED',
        data: JSON.stringify({ amountCents: 5125, reason: 'Damaged in transit' }),
      });
      expect(out).toContain('Montant : 51.25 $ CAD');
      expect(out).toContain('Raison : Damaged in transit');
    });

    it('garde uniquement amount si pas de reason', () => {
      const out = describeEvent({
        kind: 'REFUND_ISSUED',
        data: JSON.stringify({ amountCents: 1000 }),
      });
      expect(out).toBe('Montant : 10.00 $ CAD');
    });
  });

  describe('PAYMENT_FAILED', () => {
    it('lit failureMessage en priorité', () => {
      const out = describeEvent({
        kind: 'PAYMENT_FAILED',
        data: JSON.stringify({ failureMessage: 'Carte refusée', reason: 'fallback' }),
      });
      expect(out).toBe('Raison : Carte refusée');
    });

    it('fallback à reason', () => {
      const out = describeEvent({
        kind: 'PAYMENT_FAILED',
        data: JSON.stringify({ reason: 'insufficient_funds' }),
      });
      expect(out).toBe('Raison : insufficient_funds');
    });
  });

  describe('SINALITE_SUBMITTED', () => {
    it('affiche le sinaliteOrderId', () => {
      const out = describeEvent({
        kind: 'SINALITE_SUBMITTED',
        data: JSON.stringify({ sinaliteOrderId: 'SIN-ABC-123' }),
      });
      expect(out).toBe('Numéro presse : SIN-ABC-123');
    });
  });

  describe('ERROR', () => {
    it('lit message en priorité', () => {
      const out = describeEvent({
        kind: 'ERROR',
        data: JSON.stringify({ message: 'Timeout', error: 'fallback' }),
      });
      expect(out).toBe('Timeout');
    });
  });

  // finding [49] — trace client d'une demande d'annulation.
  describe('CANCEL_REQUESTED', () => {
    it('affiche la raison du client', () => {
      const out = describeEvent({
        kind: 'CANCEL_REQUESTED',
        data: JSON.stringify({ actor: 'customer', reason: 'changement de plan' }),
      });
      expect(out).toBe('Raison : changement de plan');
    });

    it('null si pas de raison dans le payload', () => {
      const out = describeEvent({
        kind: 'CANCEL_REQUESTED',
        data: JSON.stringify({ actor: 'customer' }),
      });
      expect(out).toBeNull();
    });
  });
});

describe('KIND_LABELS', () => {
  it('a un label pour chaque OrderEventKind', () => {
    const required = [
      'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED',
      'SINALITE_SUBMITTED', 'SINALITE_STATUS_CHANGED',
      'REFUND_ISSUED', 'ERROR', 'CANCEL_REQUESTED',
    ] as const;
    for (const k of required) {
      expect(KIND_LABELS[k]).toBeTruthy();
    }
  });
});
