/**
 * Les deux gardes qui empêchent d'imprimer sans contrepartie encaissée.
 *
 * POURQUOI CE FICHIER. `replay-sinalite` ne vérifiait NI le paiement NI le
 * remboursement. Deux chemins déterministes, un seul admin, un seul clic :
 *
 *   1. Le client abandonne au 3-D Secure → `payment_intent.payment_failed` →
 *      la commande passe FAILED avec `paidAt = null`. L'admin voit « Échec »
 *      dans la liste — le cas d'usage n°1 documenté de ce bouton — et clique.
 *      Production réelle facturée à Plio, zéro dollar encaissé.
 *   2. L'auto-refund rembourse intégralement puis marque FAILED. C'est la
 *      population MAJORITAIRE des commandes FAILED sans `sinaliteOrderId`.
 *      Rejouer, c'est payer l'impression ET avoir rendu l'argent.
 *
 * ⚠️ L'ASSERTION QUI COMPTE EST `createOrder` NON APPELÉ, pas le code HTTP.
 * Un futur refactor qui renverrait le bon statut APRÈS avoir soumis passerait
 * un test sur le code de retour et laisserait la presse tourner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createOrder = vi.fn();
const findUnique = vi.fn();
const refundsList = vi.fn();

vi.mock('@/lib/sinalite/client', () => ({ sinalite: { createOrder } }));
vi.mock('@/lib/db', () => ({ prisma: { order: { findUnique } } }));
vi.mock('@/lib/admin-auth', () => ({ requireAdmin: async () => ({ ok: true, session: { user: { id: 'admin1', email: 'a@plio.ca' } } }) }));
vi.mock('@/lib/db/admin-audit', () => ({ recordAdminAudit: vi.fn() }));
vi.mock('@/lib/emails/send', () => ({ sendOrderConfirmationEmail: vi.fn() }));
vi.mock('@/lib/db/orders', () => ({ markOrderSubmitted: vi.fn(), markOrderFailed: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({ getStripe: () => ({ refunds: { list: refundsList } }) }));

const { POST } = await import('@/app/api/admin/orders/[id]/replay-sinalite/route');

const commande = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  status: 'FAILED',
  paidAt: new Date('2026-08-01'),
  amountCents: 34000,
  paymentIntentId: 'pi_1',
  sinaliteOrderId: null,
  skipSinaliteSubmission: false,
  sinalitePayload: '{}',
  user: { email: 'c@example.com' },
  ...over,
});

const appeler = () => POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id: 'o1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  refundsList.mockResolvedValue({ data: [] });
});

describe('commande jamais encaissée', () => {
  it('refuse SANS rien soumettre', async () => {
    findUnique.mockResolvedValue(commande({ paidAt: null }));
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});

describe('commande remboursée', () => {
  it('remboursement INTÉGRAL : refuse sans rien soumettre', async () => {
    findUnique.mockResolvedValue(commande());
    refundsList.mockResolvedValue({ data: [{ amount: 34000, status: 'succeeded' }] });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });

  it('remboursement PARTIEL : refuse aussi, et le dit honnêtement', async () => {
    // Fail-closed : la sanction d'un faux négatif est « imprimer gratuitement ».
    // Mais le message ne doit plus prétendre « sans contrepartie ».
    findUnique.mockResolvedValue(commande());
    refundsList.mockResolvedValue({ data: [{ amount: 1500, status: 'succeeded' }] });
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    // Formatage fr-CA (virgule décimale, espace insécable) : l'assertion
    // initiale attendait « 15,00 $ » alors que `.toFixed(2)` rendait « 15.00 ».
    const { error } = await res.json();
    expect(error).toMatch(/15,00/);
    expect(error).toMatch(/340,00/);
    expect(error).toMatch(/décision manuelle/);
  });

  it('un remboursement ÉCHOUÉ ou ANNULÉ ne compte pas', async () => {
    findUnique.mockResolvedValue(commande());
    refundsList.mockResolvedValue({
      data: [{ amount: 34000, status: 'failed' }, { amount: 34000, status: 'canceled' }],
    });
    const res = await appeler();
    // ⚠️ L'ASSERTION QUI COMPTE est « pas de 409 ». La première version
    // vérifiait `refundsList` appelé — or si quelqu'un retirait le
    // `.filter(failed|canceled)`, la régression EXACTE que ce cas existe pour
    // attraper, `refundsList` serait toujours appelé et le test resterait vert.
    expect(res.status).not.toBe(409);
  });

  it('Stripe injoignable : fail-closed, on ne produit pas', async () => {
    // Ne pas savoir, c'est ne pas produire.
    findUnique.mockResolvedValue(commande());
    refundsList.mockRejectedValue(new Error('stripe down'));
    const res = await appeler();
    expect(createOrder).not.toHaveBeenCalled();
    expect(res.status).toBe(502);
  });
});
