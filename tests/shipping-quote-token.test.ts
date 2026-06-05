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

  it('multi-items : une sig émise pour 1 produit NE valide PAS un panier élargi', () => {
    // /api/shipping/estimate ne signe que le produit en cours ; un panier
    // multi-items soumet tous les productIds. La sig (1 produit) ne matche donc
    // pas l'ensemble → c'est ce faux-rejet structurel qui justifie de n'enforcer
    // ENFORCE_SHIPPING_SIG que sur les commandes mono-produit (orders/create).
    const singleProductSig = shippingQuoteToken({ ...base, productIds: [7] });
    expect(verifyShippingQuoteToken({ ...base, productIds: [7] }, singleProductSig)).toBe(true);
    expect(verifyShippingQuoteToken({ ...base, productIds: [7, 8] }, singleProductSig)).toBe(false);
  });

  it('multi-items : une sig émise pour le PANIER COMPLET valide ce panier (ordre indifférent)', () => {
    // Depuis la ré-estimation full-cart à /order/review, la sig couvre TOUS les
    // productIds → l'enforce multi-items ne produit plus de faux rejet.
    const cartSig = shippingQuoteToken({ ...base, productIds: [7, 8] });
    expect(verifyShippingQuoteToken({ ...base, productIds: [7, 8] }, cartSig)).toBe(true);
    expect(verifyShippingQuoteToken({ ...base, productIds: [8, 7] }, cartSig)).toBe(true); // canonical trie
    expect(verifyShippingQuoteToken({ ...base, productIds: [7] }, cartSig)).toBe(false); // sous-ensemble
    expect(verifyShippingQuoteToken({ ...base, productIds: [7, 8, 9] }, cartSig)).toBe(false); // sur-ensemble
  });

  it('rejette une sig absente / vide', () => {
    expect(verifyShippingQuoteToken(base, undefined)).toBe(false);
    expect(verifyShippingQuoteToken(base, '')).toBe(false);
    expect(verifyShippingQuoteToken(base, 'deadbeef')).toBe(false);
  });
});
