/**
 * Test fixture factory pour Order.
 *
 * Round 21 #1 — extension du pattern Round 19 #1 (User factory). Round 20 #3
 * a montré que 5 fixtures inline cassent à chaque colonne Order ajoutée
 * (walletCreditAppliedCents). Maintenant : 1 factory, 1 ligne à update.
 *
 * Usage :
 *   import { makeTestOrder } from '@/tests/factories/order';
 *   const order = makeTestOrder();
 *   const shipped = makeTestOrder({ status: 'SHIPPED', sinaliteOrderId: '999' });
 *   const cancelled = makeTestOrder({ status: 'CANCELLED', failureReason: 'OOS' });
 */

import type { Order } from '@prisma/client';

/**
 * Default test Order. Status PAID + sinaliteOrderId fixé (la majorité des
 * tests opèrent sur des orders en cours de pipeline, pas PENDING).
 */
export const DEFAULT_TEST_ORDER: Order = {
  id: 'order_test_1',
  userId: 'user_test_1',
  paymentIntentId: 'pi_test_1',
  amountCents: 18742,
  currency: 'CAD',
  paidAt: new Date('2026-01-01T12:00:00.000Z'),
  sinaliteOrderId: '48312',
  status: 'PAID',
  failureReason: null,
  sinalitePayload: '{}',
  productSummary: 'Cartes 14pt UV',
  itemsSnapshot: null,
  itemsCount: 250,
  subtotalCents: 15275,
  shippingCents: 1250,
  taxCents: 2217,
  discountCents: 0,
  referralCreditAppliedCents: 0,
  walletCreditAppliedCents: 0,
  resellerDiscountCents: 0,
  promoCodeId: null,
  adminNotes: null,
  shippingMethod: 'UPS Standard',
  province: 'QC',
  shipName: 'Test User',
  shipLine1: '123 rue Test',
  shipLine2: null,
  shipCity: 'Montréal',
  shipProvince: 'QC',
  shipPostalCode: 'H2X 1A1',
  shipPhone: '+15145550000',
  // Round 26 #2 — instructions livraison customer (default vide)
  shippingNote: null,
  // Round 27 #1 — abandoned-cart recovery FK (default null = organic order)
  recoveredFromCartId: null,
  createdAt: new Date('2026-01-01T11:00:00.000Z'),
  updatedAt: new Date('2026-01-01T12:00:00.000Z'),
};

export function makeTestOrder(overrides: Partial<Order> = {}): Order {
  return { ...DEFAULT_TEST_ORDER, ...overrides };
}
