/**
 * grantWelcomePromo — Audit v2 #8.3 (code promo de bienvenue).
 *
 * Le crédit de bienvenue est un CODE PROMO (et non un crédit wallet) pour
 * imposer le minimum de commande de 100 $ + 1re commande only. Verrouille :
 * (1) crée un PromoCode BIENVENUE* avec discountCents 2500, minSubtotalCents
 * 10000, maxUses 1, firstOrderOnly true ; (2) IDEMPOTENT (1 code par user, dédup
 * sur label welcome:<userId>) → retourne le code existant sans recréer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    promoCode: {
      findFirst: vi.fn(),
      create: vi.fn(async () => ({ id: 'promo_1' })),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  grantWelcomePromo,
  WELCOME_PROMO_DISCOUNT_CENTS,
  WELCOME_PROMO_MIN_SUBTOTAL_CENTS,
} from '@/lib/promo/welcome';

const findFirstMock = vi.mocked(prisma.promoCode.findFirst);
const createMock = vi.mocked(prisma.promoCode.create);

beforeEach(() => {
  vi.clearAllMocks();
  createMock.mockResolvedValue({ id: 'promo_1' } as never);
});

describe('grantWelcomePromo (#8.3)', () => {
  it('constantes : 25 $ + min 100 $', () => {
    expect(WELCOME_PROMO_DISCOUNT_CENTS).toBe(2500);
    expect(WELCOME_PROMO_MIN_SUBTOTAL_CENTS).toBe(10000);
  });

  it('1er appel → crée un PromoCode BIENVENUE* avec les bons paramètres', async () => {
    findFirstMock.mockResolvedValueOnce(null);

    const code = await grantWelcomePromo('u_new');

    expect(code).toMatch(/^BIENVENUE[A-Z0-9]{6}$/);
    const data = (createMock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      code,
      label: 'welcome:u_new',
      discountCents: 2500,
      minSubtotalCents: 10000, // ← le minimum 100 $
      maxUses: 1,
      firstOrderOnly: true, // ← 1re commande only
      active: true,
    });
  });

  it('IDEMPOTENT : un code welcome existe déjà → retourne le code existant, aucun create', async () => {
    findFirstMock.mockResolvedValueOnce({ code: 'BIENVENUEABC123' } as never);

    const code = await grantWelcomePromo('u_existing');

    expect(code).toBe('BIENVENUEABC123');
    expect(createMock).not.toHaveBeenCalled();
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { label: 'welcome:u_existing' } }),
    );
  });
});
