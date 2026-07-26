import { describe, it, expect } from 'vitest';
import { resolveConfirmationView } from '@/lib/orders/confirmation-view';

const baseOrder = {
  id: 'ord_abcdef123456',
  sinaliteOrderId: null as string | null,
  productSummary: null as string | null,
  itemsCount: 1,
  userId: 'user_alice',
};

describe('resolveConfirmationView', () => {
  it('order introuvable → null (page reste sur le fallback Stripe seul)', () => {
    expect(resolveConfirmationView(null, 'user_alice')).toBeNull();
  });

  it('displayId : SIN-xxx si Sinalite a déjà répondu, sinon les 6 derniers de l\'id', () => {
    expect(resolveConfirmationView(baseOrder, null)?.displayId).toBe('#123456');
    expect(resolveConfirmationView({ ...baseOrder, sinaliteOrderId: '78910' }, null)?.displayId).toBe('#SIN-78910');
  });

  it('productLabel : productSummary si présent, sinon compte d\'articles', () => {
    expect(resolveConfirmationView({ ...baseOrder, productSummary: 'Cartes de visite 16pt' }, null)?.productLabel)
      .toBe('Cartes de visite 16pt');
    expect(resolveConfirmationView({ ...baseOrder, productSummary: null, itemsCount: 3 }, null)?.productLabel)
      .toBe('3 articles');
    expect(resolveConfirmationView({ ...baseOrder, productSummary: null, itemsCount: 1 }, null)?.productLabel)
      .toBe('1 article');
  });

  describe('isOwner / trackingHref — décision d\'autorisation', () => {
    it('invité (pas de session) → PAS owner, /track', () => {
      const v = resolveConfirmationView(baseOrder, null);
      expect(v?.isOwner).toBe(false);
      expect(v?.trackingHref).toBe('/track');
    });

    it('connecté ET propriétaire → owner, /orders/[id]', () => {
      const v = resolveConfirmationView(baseOrder, 'user_alice');
      expect(v?.isOwner).toBe(true);
      expect(v?.trackingHref).toBe('/orders/ord_abcdef123456');
    });

    it('connecté mais PAS propriétaire (autre compte) → PAS owner, /track — jamais /orders/[id] d\'un autre', () => {
      const v = resolveConfirmationView(baseOrder, 'user_bob');
      expect(v?.isOwner).toBe(false);
      expect(v?.trackingHref).toBe('/track');
      expect(v?.trackingHref).not.toContain(baseOrder.id);
    });

    it('session vide string → traité comme absent (falsy), pas owner', () => {
      const v = resolveConfirmationView(baseOrder, '');
      expect(v?.isOwner).toBe(false);
    });
  });
});
