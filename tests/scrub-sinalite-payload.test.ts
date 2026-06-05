/**
 * Audit v3 H1 — scrubSinalitePayloadPII : retire les PII du snapshot JSON
 * Order.sinalitePayload lors d'une suppression PIPEDA, en gardant les champs
 * non identifiants (items, options, notes, province).
 */
import { describe, it, expect } from 'vitest';
import { scrubSinalitePayloadPII, type ScrubSentinels } from '@/lib/account/scrub-sinalite-payload';

const S: ScrubSentinels = { text: '[PIPEDA-DELETED]', email: 'deleted-x@anonymized.plio.local', postal: 'A0A 0A0', phone: '+10000000000' };

const payload = {
  items: [{ productId: 7, options: { Stock: '4' }, files: [{ type: 'front', url: 'https://s3/x.pdf' }] }],
  shippingInfo: {
    ShipFName: 'Sophie', ShipLName: 'Beauchamp', ShipEmail: 'sophie@exemple.ca',
    ShipAddr: '123 rue Saint-Denis', ShipAddr2: 'app 4', ShipCity: 'Montréal',
    ShipState: 'QC', ShipZip: 'H2X 1Y4', ShipPhone: '+15145551234',
  },
  billingInfo: { BillEmail: 'sophie@exemple.ca', BillPhone: '+15145551234' },
  notes: 'Commande Plio 2026-06-05',
};

describe('scrubSinalitePayloadPII', () => {
  it('remplace toutes les PII shipping + billing par les sentinelles', () => {
    const out = JSON.parse(scrubSinalitePayloadPII(JSON.stringify(payload), S));
    expect(out.shippingInfo).toMatchObject({
      ShipFName: S.text, ShipLName: S.text, ShipEmail: S.email,
      ShipAddr: S.text, ShipAddr2: '', ShipCity: S.text,
      ShipZip: S.postal, ShipPhone: S.phone,
    });
    expect(out.billingInfo).toMatchObject({ BillEmail: S.email, BillPhone: S.phone });
  });

  it('conserve province (ShipState), items et notes (non identifiants)', () => {
    const out = JSON.parse(scrubSinalitePayloadPII(JSON.stringify(payload), S));
    expect(out.shippingInfo.ShipState).toBe('QC');
    expect(out.items).toEqual(payload.items);
    expect(out.notes).toBe(payload.notes);
  });

  it('ne fuit plus aucune des valeurs PII d\'origine', () => {
    const raw = scrubSinalitePayloadPII(JSON.stringify(payload), S);
    for (const leak of ['Sophie', 'Beauchamp', 'sophie@exemple.ca', 'Saint-Denis', '5145551234', 'H2X 1Y4']) {
      expect(raw).not.toContain(leak);
    }
  });

  it('robuste : billingInfo absent, shippingInfo partiel', () => {
    const partial = JSON.stringify({ items: [], shippingInfo: { ShipFName: 'X', ShipState: 'ON' } });
    const out = JSON.parse(scrubSinalitePayloadPII(partial, S));
    expect(out.shippingInfo.ShipFName).toBe(S.text);
    expect(out.shippingInfo.ShipState).toBe('ON');
    expect(out.billingInfo).toBeUndefined();
  });

  it('JSON illisible → renvoyé tel quel (rien à fuiter de parsable)', () => {
    expect(scrubSinalitePayloadPII('not-json', S)).toBe('not-json');
  });
});
