/**
 * extractSinaliteStatus / extractTracking — lecture du payload OrderEvent
 * SINALITE_STATUS_CHANGED.
 *
 * Bug 2026-07 (docs/experience-client-2026-07.md Foyer 5) : le webhook
 * écrivait `{payload:{status,trackingNumber,carrier}}` (imbriqué) alors que
 * ces helpers lisaient `status`/`trackingNumber`/`carrier` À LA RACINE — le
 * tracking n'apparaissait donc JAMAIS dans le portail. Le fix écrit maintenant
 * à plat, mais les commandes déjà en base ont l'ancien format imbriqué : ces
 * helpers doivent lire LES DEUX formes, pas seulement la nouvelle.
 */

import { describe, it, expect } from 'vitest';
import { extractSinaliteStatus, extractTracking } from '@/lib/orders/timeline';

describe('extractSinaliteStatus', () => {
  it('nouveau format plat', () => {
    expect(extractSinaliteStatus(JSON.stringify({ status: 'SHIPPED' }))).toBe('SHIPPED');
  });

  it('ancien format imbriqué (commandes déjà en base avant le fix)', () => {
    expect(extractSinaliteStatus(JSON.stringify({ payload: { status: 'SHIPPED' } }))).toBe(
      'SHIPPED',
    );
  });

  it('aucun status dans aucun format → null', () => {
    expect(extractSinaliteStatus(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('JSON invalide → null, ne throw pas', () => {
    expect(extractSinaliteStatus('{not json')).toBeNull();
  });
});

describe('extractTracking', () => {
  it('nouveau format plat', () => {
    const events = [
      {
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({ status: 'SHIPPED', trackingNumber: '1Z999', carrier: 'UPS' }),
      },
    ];
    expect(extractTracking(events)).toMatchObject({ number: '1Z999', carrier: 'UPS' });
  });

  it('ancien format imbriqué (commandes déjà en base avant le fix)', () => {
    const events = [
      {
        kind: 'SINALITE_STATUS_CHANGED',
        data: JSON.stringify({ payload: { status: 'SHIPPED', trackingNumber: '1Z999', carrier: 'UPS' } }),
      },
    ];
    expect(extractTracking(events)).toMatchObject({ number: '1Z999', carrier: 'UPS' });
  });

  it('aucun tracking dans aucun event → null', () => {
    const events = [{ kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ status: 'SUBMITTED' }) }];
    expect(extractTracking(events)).toBeNull();
  });

  it('prend le plus récent event avec tracking (scan en arrière)', () => {
    const events = [
      { kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ trackingNumber: 'OLD', carrier: 'UPS' }) },
      { kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ status: 'DELIVERED' }) },
      { kind: 'SINALITE_STATUS_CHANGED', data: JSON.stringify({ trackingNumber: 'NEW', carrier: 'FedEx' }) },
    ];
    expect(extractTracking(events)).toMatchObject({ number: 'NEW', carrier: 'FedEx' });
  });
});
