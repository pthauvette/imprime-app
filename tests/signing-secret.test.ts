/**
 * Verrou : aucun module de signature ne doit signer avec un secret par défaut.
 *
 * CONTEXTE (audit pré-lancement 2026-07, P0-5) : cinq modules faisaient
 * `process.env.AUTH_SECRET ?? 'dev-secret'`. Combiné au fail-fast désarmé
 * (`env.ts` ne throw plus, `instrumentation.ts` avale l'erreur), une prod sans
 * `AUTH_SECRET` — déjà survenu via le bug de regex `amplify.yml` — signait les
 * HMAC avec une constante publiée dans le dépôt.
 *
 * Le jeton `shippingQuoteToken` est money-critical : c'est celui que
 * `ENFORCE_SHIPPING_SIG` valide. Avec le secret connu, on forge un devis de
 * livraison à 0 $. `paymentRetryToken` est déterministe et sans expiration →
 * accès à la page de paiement de n'importe quelle commande.
 *
 * Ces tests échouent si quelqu'un réintroduit un repli.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { signingSecret } from '@/lib/crypto/signing-secret';
import { shippingQuoteToken, verifyShippingQuoteToken } from '@/lib/shipping/quote-token';
import { paymentRetryToken } from '@/lib/payment/retry-token';

const VRAI = process.env.AUTH_SECRET;

afterEach(() => {
  if (VRAI === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = VRAI;
});

describe('signingSecret — fail-closed', () => {
  it('AUTH_SECRET absent → throw (ne signe pas)', () => {
    delete process.env.AUTH_SECRET;
    expect(() => signingSecret('test')).toThrow(/AUTH_SECRET absent/);
  });

  it('AUTH_SECRET vide → throw', () => {
    process.env.AUTH_SECRET = '';
    expect(() => signingSecret('test')).toThrow(/AUTH_SECRET absent/);
  });

  it('AUTH_SECRET trop court → throw (aligné sur le min 32 du schéma zod)', () => {
    process.env.AUTH_SECRET = 'court';
    expect(() => signingSecret('test')).toThrow(/trop court/);
  });

  it("l'usage apparaît dans l'erreur, pour situer l'incident", () => {
    delete process.env.AUTH_SECRET;
    expect(() => signingSecret('devis de livraison')).toThrow(/devis de livraison/);
  });

  it('secret valide → retourné tel quel', () => {
    const s = 'x'.repeat(40);
    process.env.AUTH_SECRET = s;
    expect(signingSecret('test')).toBe(s);
  });
});

describe('modules de signature — refus de signer sans secret', () => {
  const devis = {
    method: 'UPS Standard', price: 16.66, country: 'CA',
    province: 'QC', postal: 'H2X1Y7', productIds: [1, 7],
  };

  it('shippingQuoteToken (money-critical) refuse de signer', () => {
    delete process.env.AUTH_SECRET;
    expect(() => shippingQuoteToken(devis)).toThrow(/AUTH_SECRET absent/);
  });

  it('paymentRetryToken refuse de signer', () => {
    delete process.env.AUTH_SECRET;
    expect(() => paymentRetryToken('ord_1')).toThrow(/AUTH_SECRET absent/);
  });

  it('la vérification échoue aussi (jamais de validation avec un secret par défaut)', () => {
    // Un jeton forgé avec l'ancien 'dev-secret' ne doit PAS être accepté : la
    // vérification lève plutôt que de comparer contre un secret connu.
    process.env.AUTH_SECRET = 'y'.repeat(40);
    const valide = shippingQuoteToken(devis);
    expect(verifyShippingQuoteToken(devis, valide)).toBe(true);

    delete process.env.AUTH_SECRET;
    expect(() => verifyShippingQuoteToken(devis, valide)).toThrow(/AUTH_SECRET absent/);
  });

  it('un devis au prix modifié n\'est jamais accepté (base de ENFORCE_SHIPPING_SIG)', () => {
    process.env.AUTH_SECRET = 'z'.repeat(40);
    const token = shippingQuoteToken(devis);
    expect(verifyShippingQuoteToken({ ...devis, price: 0 }, token)).toBe(false);
  });
});
