/**
 * `/payment/retry` face à une commande dont l'issue de production est INCONNUE.
 *
 * POURQUOI CE FICHIER. Le marqueur d'incertitude rend courant un état qui
 * n'existait quasiment pas avant : FAILED, `paidAt` posé, argent CONSERVÉ (on
 * ne rembourse plus sur un doute — la production est peut-être lancée). Or
 * cette page ne refusait que PAID/IN_PRODUCTION/SHIPPED/DELIVERED/CANCELLED :
 * FAILED passait. Le lien de reprise part dans `sendPaymentFailedEmail`, il
 * n'expire pas, et le client qui rouvre un vieux courriel « paiement refusé »
 * payait une SECONDE fois une commande déjà encaissée.
 *
 * ⚠️ LE DISCRIMINANT EST LE MARQUEUR, PAS `paidAt`. Une commande refusée AVANT
 * création est remboursée puis marquée FAILED : elle porte `paidAt` elle aussi,
 * et sa reprise est légitime — c'est le cas d'usage même de cette page.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';

const { findUnique, verifyToken, checkoutCreate, countEvents } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  verifyToken: vi.fn(),
  checkoutCreate: vi.fn(),
  countEvents: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique }, orderEvent: { count: countEvents } } }));
vi.mock('@/lib/payment/retry-token', () => ({ verifyPaymentRetryToken: verifyToken }));
vi.mock('@/lib/logger', () => ({ logStripe: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('stripe', () => {
  function StripeMock(this: unknown) {
    return { checkout: { sessions: { create: checkoutCreate } } };
  }
  return { default: StripeMock };
});

import PaymentRetryPage from '@/app/payment/retry/[orderId]/page';

/** Rend la page et renvoie le texte brut, pour y chercher le message montré. */
async function rendre(order: unknown): Promise<string> {
  findUnique.mockResolvedValue(order);
  const el = await PaymentRetryPage({
    params: Promise.resolve({ orderId: 'ord_1' }),
    searchParams: Promise.resolve({ t: 'tok' }),
  });
  return JSON.stringify(el);
}

const base = {
  id: 'ord_1', status: 'FAILED', paidAt: new Date(), amountCents: 5000,
  sinaliteSubmitUncertainAt: null, user: { email: 'c@exemple.ca' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
  verifyToken.mockReturnValue(true);
  checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
  // Par défaut, la commande a bien été remboursée : les tests de non-régression
  // portent sur la reprise LÉGITIME.
  countEvents.mockResolvedValue(1);
});

describe('commande à issue de soumission INCONNUE', () => {
  it('AUCUNE session de paiement n’est ouverte', async () => {
    // L'assertion qui compte : pas le texte affiché, mais l'absence d'appel à
    // Stripe. Un futur remaniement qui afficherait le bon message APRÈS avoir
    // créé la session passerait un test sur le rendu.
    await rendre({ ...base, sinaliteSubmitUncertainAt: new Date() });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('rend le code d’erreur dédié, pas « déjà payée » ni « annulée »', async () => {
    const el = await rendre({ ...base, sinaliteSubmitUncertainAt: new Date() });
    expect(JSON.parse(el).props.code).toBe('order_verification_en_cours');
  });

  it('le message de ce code dit au client de NE PAS repayer', async () => {
    // ⚠️ VÉRIFIÉ SUR LA SOURCE, faute de mieux : la page rend
    // `<ErrorPage code=… />` et la table des messages vit dans un composant
    // local non exporté — le texte n'est donc pas dans l'élément sérialisé.
    // Ce texte est la seule chose qui sépare le client d'une seconde
    // tentative de paiement par un autre chemin (le support, un nouveau
    // panier) : le laisser sans garde-fou reviendrait à traiter la copie
    // comme décorative.
    const src = await readFile(
      new URL('../src/app/payment/retry/[orderId]/page.tsx', import.meta.url),
      'utf8',
    );
    const bloc = src.slice(src.indexOf('order_verification_en_cours: {'));
    const message = bloc.slice(0, bloc.indexOf('},'));
    expect(message).toMatch(/ne repaie pas/i);
    // On ne lui annonce ni annulation ni remboursement : on n'en sait rien.
    expect(message).not.toMatch(/annul|rembours/i);
  });
});

describe('non-régression — la reprise LÉGITIME reste ouverte', () => {
  it('FAILED remboursée après un refus prouvé (paidAt posé, aucun marqueur) → session créée', async () => {
    // Bloquer sur `paidAt` aurait cassé le cas d'usage même de cette page.
    await expect(rendre({ ...base, sinaliteSubmitUncertainAt: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('PENDING jamais payée → session créée', async () => {
    await expect(
      rendre({ ...base, status: 'PENDING', paidAt: null, sinaliteSubmitUncertainAt: null }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });
});

/**
 * Sous-cas C — encaissée, NON remboursée, sans marqueur.
 *
 * « Refus prouvé, mais le remboursement automatique a échoué lui aussi » :
 * `effacerMarqueur()` a déjà tourné, donc FAILED + `paidAt` + argent conservé
 * + AUCUN marqueur. Préexiste au lot, mais ses trois jambes sont corrélées
 * (une config sandbox met TOUTES les commandes sur le chemin du refus prouvé,
 * un hoquet Stripe fait échouer les remboursements en lot).
 */
describe('encaissée et non remboursée, sans marqueur', () => {
  it('aucune session ouverte quand aucun REFUND_ISSUED n’existe', async () => {
    countEvents.mockResolvedValue(0);
    await rendre({ ...base, sinaliteSubmitUncertainAt: null });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it('remboursement TRACÉ → la reprise redevient possible', async () => {
    // Le discriminant est la preuve du remboursement, pas `paidAt` : sinon on
    // bloquerait la reprise légitime d'une commande rendue au client.
    countEvents.mockResolvedValue(1);
    await expect(rendre({ ...base, sinaliteSubmitUncertainAt: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(checkoutCreate).toHaveBeenCalledTimes(1);
  });

  it('jamais encaissée → aucune requête d’événements, session créée', async () => {
    await expect(
      rendre({ ...base, status: 'PENDING', paidAt: null, sinaliteSubmitUncertainAt: null }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(countEvents).not.toHaveBeenCalled();
  });
});
