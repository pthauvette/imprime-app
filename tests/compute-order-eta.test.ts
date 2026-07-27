/**
 * Tests pour computeOrderEta / computeOrderEtaDate — finding [17].
 *
 * Verrouille :
 *   - jours RÉELS (productionDays/transitDays) utilisés quand présents
 *   - repli sur l'heuristique forfaitaire (4j prod + 3j transit = 7j avant
 *     expédition, 3j transit après) quand absents — comportement IDENTIQUE
 *     à avant ce fix pour les commandes sans données réelles
 *   - CANCELLED/FAILED → null
 *   - DELIVERED + shippedAt → date de livraison, pas une projection
 *   - computeOrderEtaDate et computeOrderEta restent cohérents (même Date)
 */

import { describe, it, expect } from 'vitest';
import { computeOrderEta, computeOrderEtaDate } from '@/lib/orders/timeline';

const DAY_MS = 24 * 3600 * 1000;

describe('computeOrderEtaDate — finding [17]', () => {
  it('utilise productionDays+transitDays réels avant expédition', () => {
    const createdAt = new Date();
    const eta = computeOrderEtaDate({ createdAt, status: 'PAID', productionDays: 2, transitDays: 5 });
    expect(eta).not.toBeNull();
    const diffDays = Math.round((eta!.getTime() - createdAt.getTime()) / DAY_MS);
    expect(diffDays).toBe(7); // 2 + 5, PAS le forfait 7j (coïncidence numérique volontaire du test)
  });

  it('utilise transitDays réel seul après expédition (production déjà faite)', () => {
    const createdAt = new Date(Date.now() - 10 * DAY_MS);
    const shippedAt = new Date();
    const eta = computeOrderEtaDate({ createdAt, status: 'SHIPPED', productionDays: 2, transitDays: 5 }, shippedAt);
    const diffDays = Math.round((eta!.getTime() - shippedAt.getTime()) / DAY_MS);
    expect(diffDays).toBe(5); // transitDays seul, productionDays ignoré (déjà en transit)
  });

  it('repli forfaitaire IDENTIQUE à avant le fix quand productionDays/transitDays absents (avant expédition)', () => {
    const createdAt = new Date();
    const eta = computeOrderEtaDate({ createdAt, status: 'PAID' });
    const diffDays = Math.round((eta!.getTime() - createdAt.getTime()) / DAY_MS);
    expect(diffDays).toBe(7); // 4 (défaut prod) + 3 (défaut transit) = 7, comme l'ancienne heuristique
  });

  it('repli forfaitaire IDENTIQUE à avant le fix quand transitDays absent après expédition', () => {
    const shippedAt = new Date();
    const eta = computeOrderEtaDate({ createdAt: new Date(0), status: 'SHIPPED' }, shippedAt);
    const diffDays = Math.round((eta!.getTime() - shippedAt.getTime()) / DAY_MS);
    expect(diffDays).toBe(3);
  });

  it('CANCELLED → null', () => {
    expect(computeOrderEtaDate({ createdAt: new Date(), status: 'CANCELLED' })).toBeNull();
  });

  it('FAILED → null', () => {
    expect(computeOrderEtaDate({ createdAt: new Date(), status: 'FAILED' })).toBeNull();
  });

  it('DELIVERED + shippedAt → retourne shippedAt tel quel (pas une projection)', () => {
    const shippedAt = new Date('2026-05-15T00:00:00Z');
    const eta = computeOrderEtaDate({ createdAt: new Date(0), status: 'DELIVERED' }, shippedAt);
    expect(eta).toEqual(shippedAt);
  });

  it('productionDays/transitDays à 0 (valeur réelle résolue, pas juste absente) → respectés tels quels', () => {
    const createdAt = new Date();
    const eta = computeOrderEtaDate({ createdAt, status: 'PAID', productionDays: 0, transitDays: 1 });
    const diffDays = Math.round((eta!.getTime() - createdAt.getTime()) / DAY_MS);
    expect(diffDays).toBe(1); // PAS le repli 4+3=7 — 0 est une valeur réelle, pas "absente"
  });
});

describe('computeOrderEta — cohérence avec computeOrderEtaDate', () => {
  it('day formaté correspond à la Date de computeOrderEtaDate', () => {
    const createdAt = new Date();
    const order = { createdAt, status: 'PAID', productionDays: 2, transitDays: 5 };
    const etaDate = computeOrderEtaDate(order)!;
    const eta = computeOrderEta(order)!;
    expect(eta.day).toBe(
      etaDate.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' }),
    );
  });

  it('DELIVERED → relative "livrée"', () => {
    const shippedAt = new Date();
    const eta = computeOrderEta({ createdAt: new Date(0), status: 'DELIVERED' }, shippedAt);
    expect(eta?.relative).toBe('livrée');
  });

  it('CANCELLED → null (comme computeOrderEtaDate)', () => {
    expect(computeOrderEta({ createdAt: new Date(), status: 'CANCELLED' })).toBeNull();
  });
});
