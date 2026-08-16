/**
 * Le restant remboursable de la fiche admin.
 *
 * POURQUOI CE FICHIER. Ce calcul décide si le bouton « Rembourser » est
 * cliquable. Sur une commande dont le remboursement a ÉCHOUÉ chez Stripe —
 * l'argent est revenu chez Plio, le client attend toujours — la fiche affichait
 * « Déjà remboursé : 890 $ / 890 $ » et un bouton MORT, pendant que l'alerte du
 * webhook disait « réémets le remboursement » et que l'API l'aurait accepté
 * (elle lit Stripe, pas les events).
 *
 * L'admin partait alors au dashboard Stripe — ce que l'alerte lui demande — et
 * ce nouveau remboursement n'écrivant aucun `REFUND_ISSUED`, la ligne
 * « encaissé non réconcilié » ne se refermait JAMAIS. Le lot fabriquait sa
 * propre ligne fantôme permanente.
 *
 * Le calcul vivait en ligne dans un Server Component : une campagne de mutation
 * a montré qu'on pouvait retirer la déduction sans faire rougir quoi que ce
 * soit.
 */
import { describe, it, expect } from 'vitest';
import { dejaRembourseCents } from '@/lib/finances/refund-amount';

const emis = (id: string, cents: number) =>
  ({ kind: 'REFUND_ISSUED', data: JSON.stringify({ refundId: id, amountCents: cents }) });
const echoue = (id: string) =>
  ({ kind: 'REFUND_FAILED', data: JSON.stringify({ refundId: id, raison: 'expired_or_canceled' }) });

describe('déjà remboursé', () => {
  it('aucun remboursement → zéro', () => {
    expect(dejaRembourseCents([], 89000)).toBe(0);
  });

  it('remboursement intégral → tout', () => {
    expect(dejaRembourseCents([emis('re_1', 89000)], 89000)).toBe(89000);
  });

  it('⚠️ remboursement ÉCHOUÉ → ne compte PAS (le bouton doit rester actif)', () => {
    expect(dejaRembourseCents([emis('re_1', 89000), echoue('re_1')], 89000)).toBe(0);
  });

  it('un seul des deux échoue → seul l’autre compte', () => {
    expect(dejaRembourseCents([emis('re_a', 3000), emis('re_b', 5000), echoue('re_b')], 89000)).toBe(3000);
  });

  it('l’échec ne rattache que SON refund', () => {
    expect(dejaRembourseCents([emis('re_a', 3000), echoue('re_autre')], 89000)).toBe(3000);
  });

  it('plafonné au total de la commande (§8.5)', () => {
    expect(dejaRembourseCents([emis('re_a', 60000), emis('re_b', 60000)], 89000)).toBe(89000);
  });

  it('event legacy sans montant → repli sur le total (sémantique §8.5 conservée)', () => {
    // ⚠️ REPLI VOULU ICI, à l'inverse de la réconciliation financière. Le sens
    // sûr n'est pas le même : ici, sur-estimer le déjà-remboursé ferme un
    // bouton par prudence ; là-bas, il ÉTEINDRAIT une alarme.
    expect(dejaRembourseCents([{ kind: 'REFUND_ISSUED', data: '{"refundId":"re_x"}' }], 89000)).toBe(89000);
  });
});
