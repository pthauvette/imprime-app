import { describe, it, expect } from 'vitest';
import { scrubSecretString, scrubApiKeysDeep } from './scrub-secrets';

describe('scrub-secrets — clés API Plio dans Sentry', () => {
  it('scrubSecretString : remplace plio_sk_live_/test_ par un marqueur', () => {
    expect(scrubSecretString('Bearer plio_sk_live_aBcD1234efGh5678')).toBe('Bearer plio_sk_[REDACTED]');
    expect(scrubSecretString('plio_sk_test_xxxxxxxx ok')).toBe('plio_sk_[REDACTED] ok');
    expect(scrubSecretString('rien à scrubber')).toBe('rien à scrubber');
  });

  it('scrubApiKeysDeep : scrub récursif (extra, breadcrumbs, exception, arrays)', () => {
    const event = {
      message: 'auth failed for plio_sk_live_SECRETSECRET12345',
      extra: { authInfo: { token: 'plio_sk_live_DEEPSECRET99999', userId: 'u1' } },
      breadcrumbs: [{ data: { url: 'x?key=plio_sk_test_INURL000000' } }],
      exception: { values: [{ value: 'boom plio_sk_live_EXCEPTION00000' }] },
      safe: 'no secret here',
    };
    const out = scrubApiKeysDeep(event);
    expect(out.message).not.toContain('SECRETSECRET');
    expect(out.message).toContain('plio_sk_[REDACTED]');
    expect((out.extra.authInfo as { token: string }).token).toBe('plio_sk_[REDACTED]');
    expect((out.extra.authInfo as { userId: string }).userId).toBe('u1'); // non-secret intact
    expect(out.breadcrumbs[0].data.url).toBe('x?key=plio_sk_[REDACTED]');
    expect(out.exception.values[0].value).toBe('boom plio_sk_[REDACTED]');
    expect(out.safe).toBe('no secret here');
  });

  it('tolère les cycles (anti-récursion infinie)', () => {
    const a: Record<string, unknown> = { token: 'plio_sk_live_CYCLE000000' };
    a.self = a; // cycle
    const out = scrubApiKeysDeep(a);
    expect(out.token).toBe('plio_sk_[REDACTED]');
  });
});
