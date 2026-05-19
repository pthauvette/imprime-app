/**
 * Tests pour verifySinaliteSignature + timingSafeStringEqual (Round 14 #2).
 *
 * Le but : valider que la signature check ne peut PAS être bypassed via :
 *   - header missing → false
 *   - secret empty → false
 *   - mauvais HMAC → false
 *   - bon HMAC avec différent body → false
 *   - shared-secret mode : mauvais secret → false
 *   - timing attack : strings différentes lengths → false sans early return
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  verifySinaliteSignature,
  timingSafeStringEqual,
} from '@/lib/webhooks/sinalite-signature';

const SECRET = 'plio-test-secret-key-12345';

function hmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('timingSafeStringEqual', () => {
  it('returns true pour strings identiques', () => {
    expect(timingSafeStringEqual('abc', 'abc')).toBe(true);
  });

  it('returns false pour strings différentes (même length)', () => {
    expect(timingSafeStringEqual('abc', 'abd')).toBe(false);
  });

  it('returns false pour strings de lengths différentes', () => {
    expect(timingSafeStringEqual('abc', 'abcd')).toBe(false);
  });

  it('returns false pour null/undefined castés en string', () => {
    // @ts-expect-error testing runtime safety
    expect(timingSafeStringEqual(null, 'abc')).toBe(false);
    // @ts-expect-error testing runtime safety
    expect(timingSafeStringEqual('abc', undefined)).toBe(false);
  });

  it('returns true pour empty strings', () => {
    expect(timingSafeStringEqual('', '')).toBe(true);
  });
});

describe('verifySinaliteSignature — HMAC mode (sha256=)', () => {
  const body = JSON.stringify({ orderId: 'SIN-123', status: 'SHIPPED' });

  it('accepte un HMAC valide', () => {
    const sig = `sha256=${hmac(body, SECRET)}`;
    expect(verifySinaliteSignature(body, sig, SECRET)).toBe(true);
  });

  it('rejette HMAC valide pour un AUTRE body (tampering)', () => {
    const sig = `sha256=${hmac(body, SECRET)}`;
    const tamperedBody = body.replace('SHIPPED', 'DELIVERED');
    expect(verifySinaliteSignature(tamperedBody, sig, SECRET)).toBe(false);
  });

  it('rejette HMAC calculé avec un AUTRE secret', () => {
    const sig = `sha256=${hmac(body, 'wrong-secret')}`;
    expect(verifySinaliteSignature(body, sig, SECRET)).toBe(false);
  });

  it('rejette signature mal-formée (hex tronqué)', () => {
    const sig = `sha256=${hmac(body, SECRET).slice(0, 32)}`;
    expect(verifySinaliteSignature(body, sig, SECRET)).toBe(false);
  });
});

describe('verifySinaliteSignature — shared bearer mode (legacy)', () => {
  it('accepte le secret brut quand pas de prefix sha256=', () => {
    expect(verifySinaliteSignature('any-body', SECRET, SECRET)).toBe(true);
  });

  it('rejette un secret différent', () => {
    expect(verifySinaliteSignature('any-body', 'wrong-secret', SECRET)).toBe(false);
  });

  it('rejette si le header a la même length mais content différent', () => {
    const wrong = SECRET.split('').reverse().join('');
    expect(verifySinaliteSignature('any-body', wrong, SECRET)).toBe(false);
  });
});

describe('verifySinaliteSignature — edge cases', () => {
  it('rejette header null', () => {
    expect(verifySinaliteSignature('body', null, SECRET)).toBe(false);
  });

  it('rejette secret empty (config error)', () => {
    expect(verifySinaliteSignature('body', 'anything', '')).toBe(false);
  });

  it('rejette header empty', () => {
    expect(verifySinaliteSignature('body', '', SECRET)).toBe(false);
  });

  it('rejette signature "sha256=" sans rien après', () => {
    expect(verifySinaliteSignature('body', 'sha256=', SECRET)).toBe(false);
  });
});
