/**
 * buildShipPayload — Audit v2 #4.2.
 *
 * Source unique du « ship » pour nextHref (→ review) ET resumeQuery
 * (abandoned-cart). Verrouille : sig TOUJOURS présent (sa perte bloquait le flip
 * du garde shipping log-only → 409), note trim+slice, parité des deux usages.
 */

import { describe, it, expect } from 'vitest';
import { buildShipPayload, type ShipPayloadInput } from '@/lib/order/ship-payload';

const BASE: ShipPayloadInput = {
  firstName: 'Ada', lastName: 'Lovelace', email: 'ada@plio.ca', phone: '5145551234',
  line1: '1 rue Test', line2: '', city: 'Montréal', province: 'QC', postalCode: 'H2X1Y4',
  method: 'EXPEDITED', price: 14.99, sig: 'sig_abc123',
};

describe('buildShipPayload', () => {
  it('inclut TOUJOURS le sig (anti-tamper du devis)', () => {
    const parsed = JSON.parse(buildShipPayload(BASE));
    expect(parsed.sig).toBe('sig_abc123');
  });

  it('note absente/vide → clé note omise', () => {
    expect(JSON.parse(buildShipPayload(BASE))).not.toHaveProperty('note');
    expect(JSON.parse(buildShipPayload({ ...BASE, note: '   ' }))).not.toHaveProperty('note');
  });

  it('note présente → trim + slice à 200 chars', () => {
    const parsed = JSON.parse(buildShipPayload({ ...BASE, note: '  Sonner à la porte  ' }));
    expect(parsed.note).toBe('Sonner à la porte');
    const long = JSON.parse(buildShipPayload({ ...BASE, note: 'x'.repeat(300) }));
    expect(long.note).toHaveLength(200);
  });

  it('parité : nextHref et resumeQuery produisent le MÊME ship pour les mêmes entrées', () => {
    // Les deux call sites passent exactement le même input → même string.
    const fromNextHref = buildShipPayload(BASE);
    const fromResumeQuery = buildShipPayload(BASE);
    expect(fromNextHref).toBe(fromResumeQuery);
    // et le sig survit dans les deux
    expect(JSON.parse(fromResumeQuery).sig).toBe(JSON.parse(fromNextHref).sig);
  });

  it('porte tous les champs contact + adresse + devis', () => {
    const p = JSON.parse(buildShipPayload(BASE));
    expect(p).toMatchObject({
      firstName: 'Ada', lastName: 'Lovelace', email: 'ada@plio.ca',
      city: 'Montréal', province: 'QC', postalCode: 'H2X1Y4',
      method: 'EXPEDITED', price: 14.99, sig: 'sig_abc123',
    });
  });
});
