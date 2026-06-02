/**
 * Régression sécurité (Round 1 audit) — devis de livraison signé.
 */

import { describe, it, expect } from 'vitest';
import { shippingQuoteToken, verifyShippingQuoteToken, type ShippingQuoteFields } from '@/lib/shipping/quote-token';

const base: ShippingQuoteFields = {
  method: 'UPS Standard',
  price: 14.99,
  country: 'CA',
  province: 'QC',
  postal: 'H2X 1Y4',
  productIds: [7, 3, 19],
};

describe('shippingQuoteToken', () => {
  it('round-trip : un devis signé se vérifie', () => {
    expect(verifyShippingQuoteToken(base, shippingQuoteToken(base))).toBe(true);
  });

  it('normalise postal (casse/espaces) et ordre des productIds', () => {
    const t = shippingQuoteToken(base);
    expect(verifyShippingQuoteToken({ ...base, postal: 'h2x1y4' }, t)).toBe(true);
    expect(verifyShippingQuoteToken({ ...base, productIds: [19, 7, 3] }, t)).toBe(true);
  });

  it('rejette tout tampering : prix, méthode, destination, produits', () => {
    const t = shippingQuoteToken(base);
    expect(verifyShippingQuoteToken({ ...base, price: 0 }, t)).toBe(false); // sous-paiement
    expect(verifyShippingQuoteToken({ ...base, price: 14.98 }, t)).toBe(false); // 1¢
    expect(verifyShippingQuoteToken({ ...base, method: 'FedEx Express' }, t)).toBe(false);
    expect(verifyShippingQuoteToken({ ...base, province: 'ON' }, t)).toBe(false);
    expect(verifyShippingQuoteToken({ ...base, postal: 'H2X 9Z9' }, t)).toBe(false);
    expect(verifyShippingQuoteToken({ ...base, productIds: [7, 3, 19, 99] }, t)).toBe(false); // ajout produit
  });

  it('rejette une sig absente / vide', () => {
    expect(verifyShippingQuoteToken(base, undefined)).toBe(false);
    expect(verifyShippingQuoteToken(base, '')).toBe(false);
    expect(verifyShippingQuoteToken(base, 'deadbeef')).toBe(false);
  });
});
