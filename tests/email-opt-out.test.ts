/**
 * Tests pour l'opt-out des delivery emails (CASL compliance).
 *
 * Critique : si un user a `emailDeliveryNotifications: false`, on doit
 * skip les shipped + delivered emails MAIS toujours envoyer les
 * transactional required (confirmation, refund, cancellation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendOrderShippedEmail,
  sendOrderDeliveredEmail,
  sendOrderConfirmationEmail,
} from '@/lib/emails/send';
import type { Order, User } from '@prisma/client';

// Mock sendEmail au niveau du module render — on veut tester la garde
// opt-out sans toucher SES réel.
vi.mock('@/lib/emails/render', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
  EMAIL_SUBJECTS: {},
}));

import * as render from '@/lib/emails/render';

const baseUser: User = {
  id: 'user_1',
  email: 'test@plio.ca',
  name: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  phone: null,
  emailVerified: null,
  image: null,
  role: 'USER',
  emailDeliveryNotifications: true, emailMarketing: true, emailReengagement: true, referralCode: null, referredByCode: null, referralCreditCents: 0, adminNotes: null, adminNotesUpdatedAt: null, adminNotesUpdatedBy: null, loyaltyTier: 'BRONZE', loyaltyTierComputedAt: null, walletCents: 0, // default
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseOrder: Order = {
  id: 'order_1',
  userId: 'user_1',
  paymentIntentId: 'pi_test',
  amountCents: 18742,
  currency: 'CAD',
  paidAt: new Date(),
  sinaliteOrderId: '48312',
  status: 'SHIPPED',
  failureReason: null,
  sinalitePayload: '{}',
  productSummary: 'Cartes 14pt UV', itemsSnapshot: null,
  itemsCount: 250,
  subtotalCents: 15275,
  shippingCents: 1250,
  taxCents: 2217,
  discountCents: 0, referralCreditAppliedCents: 0,
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
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('sendOrderShippedEmail — opt-out gating', () => {
  beforeEach(() => {
    vi.mocked(render.sendEmail).mockClear();
  });

  it('envoie l\'email si emailDeliveryNotifications=true', async () => {
    const r = await sendOrderShippedEmail({
      order: baseOrder,
      user: { ...baseUser, emailDeliveryNotifications: true },
      trackingNumber: '1Z123',
      carrier: 'UPS',
    });
    expect(render.sendEmail).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ sent: true });
  });

  it('SKIP l\'email si emailDeliveryNotifications=false', async () => {
    const r = await sendOrderShippedEmail({
      order: baseOrder,
      user: { ...baseUser, emailDeliveryNotifications: false },
      trackingNumber: '1Z123',
    });
    expect(render.sendEmail).not.toHaveBeenCalled();
    expect(r).toMatchObject({ sent: false, optedOut: true });
  });
});

describe('sendOrderDeliveredEmail — opt-out gating', () => {
  beforeEach(() => {
    vi.mocked(render.sendEmail).mockClear();
  });

  it('envoie si opted-in', async () => {
    await sendOrderDeliveredEmail({
      order: baseOrder,
      user: baseUser,
    });
    expect(render.sendEmail).toHaveBeenCalledOnce();
  });

  it('skip si opted-out', async () => {
    const r = await sendOrderDeliveredEmail({
      order: baseOrder,
      user: { ...baseUser, emailDeliveryNotifications: false },
    });
    expect(render.sendEmail).not.toHaveBeenCalled();
    expect(r).toMatchObject({ sent: false, optedOut: true });
  });
});

describe('sendOrderConfirmationEmail — TOUJOURS envoyé (required)', () => {
  beforeEach(() => {
    vi.mocked(render.sendEmail).mockClear();
  });

  it('envoie même si emailDeliveryNotifications=false', async () => {
    // Required transactional — peut PAS être opt-out.
    // Le user vient juste de payer, on DOIT lui confirmer.
    await sendOrderConfirmationEmail({
      order: baseOrder,
      user: { ...baseUser, emailDeliveryNotifications: false },
    });
    expect(render.sendEmail).toHaveBeenCalledOnce();
  });

  it('passe le productSummary dans PRODUCT_NAME', async () => {
    await sendOrderConfirmationEmail({
      order: { ...baseOrder, productSummary: 'Cartes 14pt + UV' },
      user: baseUser,
    });
    expect(render.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({ PRODUCT_NAME: 'Cartes 14pt + UV' }),
      }),
    );
  });

  it('fallback PRODUCT_NAME si productSummary null', async () => {
    await sendOrderConfirmationEmail({
      order: { ...baseOrder, productSummary: null },
      user: baseUser,
    });
    expect(render.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({ PRODUCT_NAME: 'Ta commande Plio' }),
      }),
    );
  });
});
