/**
 * Ce que le CLIENT voit d'une commande dont la soumission est partie sans
 * réponse.
 *
 * POURQUOI CE FICHIER. Le marqueur d'incertitude rend courant un état qui
 * n'existait quasiment pas : payée, non remboursée, production peut-être
 * lancée. En base c'est `FAILED` — et `FAILED` était rangé sous « Annulées »
 * avec le libellé « Échec ». Deux affirmations fausses pour le client : rien
 * n'a été annulé, et rien n'a été remboursé (à dessein).
 *
 * Le libellé de statut ne mentait pas tout seul ; c'est le REGROUPEMENT qui
 * mentait. Les deux sont corrigés ici, et le compte des pastilles doit suivre
 * la même dérivation que le filtre — sinon « Annulées 1 » n'affiche rien.
 */
import { describe, it, expect } from 'vitest';
import { groupeDe, bucketStatus, remboursementProposable } from '@/lib/orders/client-groups';
import type { OrderRowProps } from '@/components/account/OrderRow';

const base: OrderRowProps = {
  id: 'o1', displayId: '#ABC123', status: 'FAILED', createdAt: new Date(),
  amountCents: 5000, shippingMethod: 'UPS', taxCents: 0,
  shipName: 'A', shipCity: 'Mtl', shipProvince: 'QC',
};

describe('regroupement côté client', () => {
  it('commande à vérifier → « En cours », PAS « Annulées »', () => {
    expect(groupeDe({ ...base, verificationEnCours: true })).toBe('live');
  });

  it('commande réellement échouée ou annulée → « Annulées »', () => {
    expect(groupeDe({ ...base, verificationEnCours: false })).toBe('cancelled');
    expect(groupeDe({ ...base, status: 'CANCELLED' })).toBe('cancelled');
  });

  it.each([
    ['PAID', 'live'],
    ['SUBMITTED', 'live'],
    ['IN_PRODUCTION', 'live'],
    ['SHIPPED', 'shipped'],
    ['DELIVERED', 'delivered'],
  ] as const)('%s reste dans « %s » (non-régression)', (status, groupe) => {
    expect(groupeDe({ ...base, status })).toBe(groupe);
  });

  it('un statut hors table ne disparaît pas de la liste', () => {
    // `PENDING` n'appartient à aucun groupe : sans repli, la commande
    // n'apparaissait sous AUCUNE pastille — invisible plutôt que mal rangée.
    expect(groupeDe({ ...base, status: 'PENDING' })).toBe('live');
  });
});

describe('les comptes suivent EXACTEMENT le filtre', () => {
  it('une commande à vérifier compte dans « En cours », pas dans « Annulées »', () => {
    const c = bucketStatus([{ ...base, verificationEnCours: true }]);
    expect(c.live).toBe(1);
    expect(c.CANCELLED).toBe(0);
  });

  it('aucune commande ne compte deux fois ni ne s’évapore', () => {
    // La régression qu'on redoute : deux tables de correspondance qui
    // divergent. « Annulées 1 » et un clic qui ne montre rien.
    const orders: OrderRowProps[] = [
      { ...base, id: 'a', verificationEnCours: true },
      { ...base, id: 'b', status: 'CANCELLED' },
      { ...base, id: 'c', status: 'SHIPPED' },
      { ...base, id: 'd', status: 'DELIVERED' },
      { ...base, id: 'e', status: 'PAID' },
    ];
    const c = bucketStatus(orders);
    expect(c.live + c.SHIPPED + c.DELIVERED + c.CANCELLED).toBe(orders.length);
    for (const groupe of ['live', 'shipped', 'delivered', 'cancelled'] as const) {
      const attendu = orders.filter((o) => groupeDe(o) === groupe).length;
      const compte = { live: c.live, shipped: c.SHIPPED, delivered: c.DELIVERED, cancelled: c.CANCELLED }[groupe];
      expect(compte).toBe(attendu);
    }
  });
});

/**
 * Règle de proposition du remboursement — ÉPROUVÉE, pas lue.
 *
 * La revue money-path a relevé que le test qui « verrouillait » cette règle
 * lisait le texte source de `OrderActions.tsx` et assertait des motifs de
 * chaîne : il passait donc sur `… && (status !== 'FAILED' || encaissee) &&
 * false`. La règle est maintenant une fonction pure, et voici son
 * comportement.
 */
describe('remboursement proposable depuis la fiche', () => {
  const r = (o: Partial<Parameters<typeof remboursementProposable>[0]>) =>
    remboursementProposable({ status: 'PAID', restantCents: 5000, encaissee: true, ...o });

  it('⚠️ FAILED ENCAISSÉE → proposable (c’est le cas que ce lot crée)', () => {
    // Une soumission partie sans réponse laisse FAILED avec l'argent conservé.
    // Rembourser n'était offert nulle part alors que la route l'accepte.
    expect(r({ status: 'FAILED', encaissee: true })).toBe(true);
  });

  it('FAILED jamais encaissée (3-D Secure abandonné) → PAS proposable', () => {
    // Rien à rendre ; proposer le geste ferait échouer l'appel côté Stripe.
    expect(r({ status: 'FAILED', encaissee: false })).toBe(false);
  });

  it('FAILED déjà auto-remboursée → PAS proposable (restant nul)', () => {
    // La population majoritaire des FAILED s'écarte toute seule.
    expect(r({ status: 'FAILED', encaissee: true, restantCents: 0 })).toBe(false);
  });

  it.each(['PENDING', 'CANCELLED'])('%s → jamais proposable', (status) => {
    expect(r({ status })).toBe(false);
  });

  it.each(['PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED'])(
    '%s avec un restant → proposable (non-régression)',
    (status) => {
      expect(r({ status })).toBe(true);
    },
  );

  it('restant négatif ou nul → jamais proposable, quel que soit le statut', () => {
    expect(r({ restantCents: 0 })).toBe(false);
    expect(r({ restantCents: -1 })).toBe(false);
  });
});
