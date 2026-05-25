/**
 * Tests src/lib/webhooks/sns-verify.ts — Round 39 #4.
 *
 * Lock-in :
 *  - SigningCertURL doit pointer vers sns.<region>.amazonaws.com (sécurité)
 *  - SignatureVersion 1 = RSA-SHA1, 2 = RSA-SHA256
 *  - Mauvaise signature → throw
 *  - Build canonique du string-to-sign : fields dans l'ordre spécifié,
 *    skip ceux qui n'existent pas dans le payload
 *
 * On génère un keypair RSA in-memory pour signer un payload de test,
 * puis on injecte le PEM public via `certFetcher` pour bypass le fetch HTTP.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifySnsSignature, _clearCertCacheForTests, type SnsMessage } from '@/lib/webhooks/sns-verify';

let keyPair: ReturnType<typeof generateKeyPairSync>;

beforeEach(() => {
  _clearCertCacheForTests();
  keyPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
});

function buildSignedNotification(overrides: Partial<SnsMessage> = {}, version: '1' | '2' = '1'): SnsMessage {
  const base: SnsMessage = {
    Type: 'Notification',
    MessageId: 'msg-' + Math.random().toString(36).slice(2),
    TopicArn: 'arn:aws:sns:us-east-1:123:plio-ses',
    Subject: 'Amazon SES Email Event Notification',
    Message: JSON.stringify({ notificationType: 'Bounce' }),
    Timestamp: '2026-05-25T12:00:00.000Z',
    SignatureVersion: version,
    Signature: '', // filled below
    SigningCertURL: 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-cert.pem',
    ...overrides,
  };

  // Build canonical string-to-sign exactly as the verifier does.
  const fields = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const;
  const parts: string[] = [];
  for (const f of fields) {
    const v = (base as unknown as Record<string, unknown>)[f];
    if (v !== undefined && v !== null) parts.push(`${f}\n${String(v)}\n`);
  }
  const stringToSign = parts.join('');

  const algo = version === '1' ? 'RSA-SHA1' : 'RSA-SHA256';
  const signer = createSign(algo);
  signer.update(stringToSign, 'utf8');
  base.Signature = signer.sign(keyPair.privateKey, 'base64');

  return base;
}

describe('verifySnsSignature', () => {
  it('accepts un payload SHA1 (SignatureVersion 1) bien signé', async () => {
    const msg = buildSignedNotification({}, '1');
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    await expect(
      verifySnsSignature(msg, { certFetcher: async () => pem }),
    ).resolves.toBeUndefined();
  });

  it('accepts un payload SHA256 (SignatureVersion 2) bien signé', async () => {
    const msg = buildSignedNotification({}, '2');
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    await expect(
      verifySnsSignature(msg, { certFetcher: async () => pem }),
    ).resolves.toBeUndefined();
  });

  it('throw si signature corrompue', async () => {
    const msg = buildSignedNotification();
    msg.Signature = 'AAAA' + msg.Signature.slice(4); // tamper
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    await expect(
      verifySnsSignature(msg, { certFetcher: async () => pem }),
    ).rejects.toThrow(/signature verification failed/i);
  });

  it('throw si SignatureVersion invalide', async () => {
    const msg = buildSignedNotification();
    (msg as { SignatureVersion: string }).SignatureVersion = '99';
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    await expect(
      verifySnsSignature(msg, { certFetcher: async () => pem }),
    ).rejects.toThrow(/SignatureVersion/);
  });

  it('throw si SigningCertURL pas un host AWS SNS officiel', async () => {
    const msg = buildSignedNotification({
      SigningCertURL: 'https://evil.attacker.com/cert.pem',
    });
    // Use the real fetcher to exercise the hostname check (we never reach fetch)
    await expect(verifySnsSignature(msg)).rejects.toThrow(/not an AWS SNS endpoint/i);
  });

  it('throw si SigningCertURL HTTP plain (pas HTTPS)', async () => {
    const msg = buildSignedNotification({
      SigningCertURL: 'http://sns.us-east-1.amazonaws.com/cert.pem',
    });
    await expect(verifySnsSignature(msg)).rejects.toThrow(/HTTPS/i);
  });

  it('throw si signature valide mais payload modifié après signing', async () => {
    const msg = buildSignedNotification();
    msg.Message = JSON.stringify({ notificationType: 'Complaint' }); // tampered
    const pem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }) as string;
    await expect(
      verifySnsSignature(msg, { certFetcher: async () => pem }),
    ).rejects.toThrow(/signature verification failed/i);
  });
});
