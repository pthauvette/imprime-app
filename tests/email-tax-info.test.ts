/**
 * Tests pour le bloc "reçu légal" (TPS/TVQ + identité vendeur) ajouté
 * au footer de email-order-confirmation. Requis art. 169 LTA + art. 350
 * LTVQ pour les reçus B2B.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/emails/render', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
  EMAIL_SUBJECTS: {},
}));

import * as render from '@/lib/emails/render';
import type { Order, User } from '@prisma/client';

async function importSendFresh() {
  vi.resetModules();
  // Re-mock après reset
  vi.doMock('@/lib/emails/render', () => ({
    sendEmail: vi.fn(async () => ({ sent: true })),
    EMAIL_SUBJECTS: {},
  }));
  const renderMod = await import('@/lib/emails/render');
  const sendMod = await import('@/lib/emails/send');
  return { send: sendMod, render: renderMod };
}

const baseUser: User = {
  id: 'u_1', email: 't@p.ca', name: 'T', firstName: 'T', lastName: null,
  phone: null, emailVerified: null, image: null, role: 'USER',
  emailDeliveryNotifications: true, emailMarketing: true, emailReengagement: true, referralCode: null, referredByCode: null, referralCreditCents: 0, adminNotes: null, adminNotesUpdatedAt: null, adminNotesUpdatedBy: null, loyaltyTier: 'BRONZE', loyaltyTierComputedAt: null, walletCents: 0, taxExempt: false, taxExemptCertId: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const baseOrder: Order = {
  id: 'o_1', userId: 'u_1', paymentIntentId: 'pi_x',
  amountCents: 18742, currency: 'CAD', paidAt: new Date(),
  sinaliteOrderId: '48312', status: 'PAID', failureReason: null,
  sinalitePayload: '{}', productSummary: 'Cartes', itemsSnapshot: null,
  itemsCount: 250, subtotalCents: 15275, shippingCents: 1250, taxCents: 2217,
  discountCents: 0, referralCreditAppliedCents: 0, promoCodeId: null, adminNotes: null,
  shippingMethod: 'UPS Standard', province: 'QC',
  shipName: 'X', shipLine1: '1 rue', shipLine2: null,
  shipCity: 'Mtl', shipProvince: 'QC', shipPostalCode: 'H2X 1A1',
  shipPhone: '+15140000000',
  createdAt: new Date(), updatedAt: new Date(),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('sendOrderConfirmationEmail — bloc reçu légal (TPS/TVQ)', () => {
  it('passe les COMPANY_* vars depuis env', async () => {
    vi.stubEnv('COMPANY_LEGAL_NAME', 'Démocratik inc.');
    vi.stubEnv('COMPANY_ADDRESS', '4200 boul. Saint-Laurent, Montréal QC H2W 2R2');
    vi.stubEnv('COMPANY_GST_NUMBER', '123456789 RT0001');
    vi.stubEnv('COMPANY_QST_NUMBER', '1234567890 TQ0001');

    const { send, render } = await importSendFresh();
    await send.sendOrderConfirmationEmail({ order: baseOrder, user: baseUser });

    expect(render.sendEmail).toHaveBeenCalledOnce();
    const args = vi.mocked(render.sendEmail).mock.calls[0][0];
    expect(args.vars.COMPANY_LEGAL_NAME).toBe('Démocratik inc.');
    expect(args.vars.COMPANY_ADDRESS).toBe('4200 boul. Saint-Laurent, Montréal QC H2W 2R2');
    expect(args.vars.COMPANY_GST_NUMBER).toBe('123456789 RT0001');
    expect(args.vars.COMPANY_QST_NUMBER).toBe('1234567890 TQ0001');
  });

  it('fallback à placeholder si env vars absentes (pas de crash en dev)', async () => {
    vi.stubEnv('COMPANY_LEGAL_NAME', '');
    vi.stubEnv('COMPANY_GST_NUMBER', '');
    vi.stubEnv('COMPANY_QST_NUMBER', '');

    const { send, render } = await importSendFresh();
    await send.sendOrderConfirmationEmail({ order: baseOrder, user: baseUser });

    const args = vi.mocked(render.sendEmail).mock.calls[0][0];
    expect(args.vars.COMPANY_LEGAL_NAME).toBe('Démocratik inc.');
    expect(args.vars.COMPANY_GST_NUMBER).toBe('(num. TPS à venir)');
    expect(args.vars.COMPANY_QST_NUMBER).toBe('(num. TVQ à venir)');
  });
});
