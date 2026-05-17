/**
 * Vitest setup — inject les env vars dummies pour les tests unitaires.
 *
 * Plusieurs modules (sinalite/client, emails/render, auth) validate
 * process.env au load time. En test on n'a pas accès aux vrais creds, on
 * injecte des fakes qui satisfont les schemas Zod sans appeler le réseau.
 */

process.env.SINALITE_CLIENT_ID ||= 'test-client-id';
process.env.SINALITE_CLIENT_SECRET ||= 'test-client-secret';
process.env.SINALITE_API_BASE ||= 'https://api.sinaliteuppy.com';
process.env.SINALITE_AUDIENCE ||= 'https://apiconnect.sinalite.com';
process.env.SINALITE_AUTH_BASE ||= 'https://api.sinaliteuppy.com';
process.env.SINALITE_STORE_CODE ||= 'en_ca';

process.env.AUTH_SECRET ||= 'test-auth-secret-min-32-chars-long-aaaaaa';
process.env.STRIPE_SECRET_KEY ||= 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET ||= 'whsec_test_dummy';

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
