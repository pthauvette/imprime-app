/**
 * Test fixture factory pour User.
 *
 * Round 19 #1 — extraction de 4 fixtures inline qui dupliquaient le shape
 * complet du User row. Quand on ajoute une colonne au schema (loyaltyTier,
 * walletCents, taxExempt récemment), il fallait éditer 4 fichiers test.
 * Maintenant : un seul endroit.
 *
 * Usage :
 *   import { makeTestUser } from '@/tests/factories/user';
 *   const user = makeTestUser();
 *   const admin = makeTestUser({ role: 'ADMIN', email: 'admin@plio.ca' });
 *   const optedOut = makeTestUser({ emailDeliveryNotifications: false });
 */

import type { User } from '@prisma/client';

/**
 * Default test User. Tous les champs nullable sont null, tous les flag
 * booleans sont à leur default DB. Override via le 2nd argument.
 *
 * Exporté pour les tests qui veulent diff "qu'est-ce qui a changé par
 * rapport au default" (ex: assert toggle taxExempt updated the field).
 */
export const DEFAULT_TEST_USER: User = {
  id: 'user_test_1',
  email: 'test@plio.ca',
  name: 'Test User',
  emailVerified: null,
  image: null,
  firstName: 'Test',
  lastName: 'User',
  phone: null,
  // Défaut délibéré à `null` : un compte de test ne doit PAS être réputé
  // vérifié par SMS sans le dire. Les tests de connexion par texto posent
  // explicitement ces deux champs — sinon ils testeraient un état qui ne se
  // produit jamais en vrai (un numéro d'identité sans date de vérification).
  phoneVerified: null,
  phoneVerifiedAt: null,
  companyName: null,
  role: 'USER',
  emailDeliveryNotifications: true,
  emailMarketing: true,
  emailReengagement: true,
  referralCode: null,
  referredByCode: null,
  referralCreditCents: 0,
  walletCents: 0,
  walletLastActivityAt: null,
  walletExpiryWarningAt: null,
  walletAutoRenewStripeSubId: null,
  walletAutoRenewAmountCents: null,
  // Round 28 #5 — pause sans cancel (NULL = active)
  walletAutoRenewPausedAt: null,
  loyaltyTier: 'BRONZE',
  loyaltyTierComputedAt: null,
  taxExempt: false,
  taxExemptCertId: null,
  resellerStatus: 'NONE',
  resellerDetectedAt: null,
  adminNotes: null,
  adminNotesUpdatedAt: null,
  adminNotesUpdatedBy: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * Crée un User test avec defaults + overrides.
 *
 * Pattern : spread defaults first, overrides last → test-specific values
 * win. Si le schema ajoute un champ, on l'ajoute dans DEFAULT_TEST_USER
 * et zéro test ne casse (sauf ceux qui explicit-test ce champ).
 */
export function makeTestUser(overrides: Partial<User> = {}): User {
  return { ...DEFAULT_TEST_USER, ...overrides };
}
