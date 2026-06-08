import { describe, it, expect } from 'vitest';
import { buildSinaliteOptionsMap, formatShippingText } from './shipping';

describe('MCP estimate_shipping — helpers purs', () => {
  it('buildSinaliteOptionsMap mappe les IDs en { opt_N: id } (format Sinalite/wizard)', () => {
    expect(buildSinaliteOptionsMap([5, 30, 203])).toEqual({
      opt_0: '5',
      opt_1: '30',
      opt_2: '203',
    });
    expect(buildSinaliteOptionsMap([])).toEqual({});
  });

  it('formatShippingText liste les méthodes triées + le moins cher', () => {
    const text = formatShippingText('cartes-de-visite', 'QC', 'H2X1Y7', {
      ok: true,
      methods: [
        { carrier: 'UPS', method: 'UPS Standard', price: 12.5, days: 4, sig: 'a' },
        { carrier: 'FedEx', method: 'FedEx Express', price: 22, days: 2, sig: 'b' },
      ],
      cheapest: { carrier: 'UPS', method: 'UPS Standard', price: 12.5, days: 4, sig: 'a' },
    });
    expect(text).toContain('UPS Standard');
    expect(text).toContain('12.50 $');
    expect(text).toContain('moins cher');
    expect(text).not.toContain('undefined');
  });

  it('formatShippingText rend une erreur propre', () => {
    const text = formatShippingText('x', 'QC', 'H2X1Y7', {
      ok: false,
      reason: 'quantity_unavailable',
      message: 'Quantité 333 indisponible.',
      availableQuantities: [250, 500],
    });
    expect(text).toContain('❌');
    expect(text).toContain('250, 500');
  });
});
