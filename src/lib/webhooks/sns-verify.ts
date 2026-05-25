/**
 * AWS SNS signature verification (Round 39 #4).
 *
 * Spec : https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 *
 * Pourquoi vérifier la signature et pas juste un Bearer secret :
 *   - Un Bearer secret en query string apparait dans les logs proxy / CDN
 *     côté AWS (le SubscribeURL est public — n'importe qui qui a une URL
 *     valide peut nous POSTer du faux trafic).
 *   - La signature RSA prouve qu'AWS a réellement émis le message, donc
 *     on peut faire confiance au contenu pour suppress des emails (qui
 *     est une action destructive irreversible côté queue SES).
 *
 * Le cert pub est fetched depuis SigningCertURL qui DOIT pointer vers
 * un domaine AWS officiel (sns.<region>.amazonaws.com) — on hard-check
 * pour empêcher un attaquant de fournir son propre cert via une URL
 * arbitraire (sinon il pourrait signer ses propres payloads).
 *
 * Cache : le cert change rarement (rotation ~annuelle). On cache en
 * mémoire 1h pour économiser la latence d'un fetch HTTP par notification.
 */

import { createVerify } from 'node:crypto';

/** Fields à signer dans cet ordre exact pour un Notification message. */
const NOTIFICATION_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const;

/** Fields à signer dans cet ordre exact pour SubscriptionConfirmation / UnsubscribeConfirmation. */
const SUBSCRIPTION_FIELDS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const;

/** Cache : url cert → { pem, expiresAt }. 1h TTL. */
const CERT_CACHE_TTL_MS = 60 * 60 * 1000;
const certCache = new Map<string, { pem: string; expiresAt: number }>();

/**
 * Récupère le certificate PEM depuis le SigningCertURL fourni par SNS.
 * Hard-check que l'URL pointe vers un domaine AWS officiel pour empêcher
 * un attaquant d'injecter son propre cert.
 */
async function fetchSigningCert(url: string): Promise<string> {
  // Cache hit ?
  const cached = certCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pem;
  }

  // SECURITY : valider que le SigningCertURL pointe vers AWS officiel.
  // Sans ça, un attaquant pourrait nous faire fetch un cert dont il a
  // la clé privée, puis signer ses propres payloads.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SigningCertURL is not a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('SigningCertURL must use HTTPS');
  }
  // Pattern accepté : sns.<region>.amazonaws.com OU sns.<region>.amazonaws.com.cn
  // (régions chinoises). Le hostname doit terminer par .amazonaws.com[.cn]
  // ET commencer par "sns.".
  const host = parsed.hostname.toLowerCase();
  const validSnsHost =
    (host.startsWith('sns.') && host.endsWith('.amazonaws.com')) ||
    (host.startsWith('sns.') && host.endsWith('.amazonaws.com.cn'));
  if (!validSnsHost) {
    throw new Error(`SigningCertURL host ${host} is not an AWS SNS endpoint`);
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`SigningCertURL fetch failed: ${res.status}`);
  }
  const pem = await res.text();
  certCache.set(url, { pem, expiresAt: Date.now() + CERT_CACHE_TTL_MS });
  return pem;
}

/**
 * Build le "string to sign" canonique selon le type de message.
 * Format : pour chaque field dans l'ordre, "FieldName\nValue\n".
 * Skip un field qui n'existe pas dans le payload (ex: Subject est optionnel).
 */
function buildStringToSign(msg: SnsMessage): string {
  const fields = msg.Type === 'Notification' ? NOTIFICATION_FIELDS : SUBSCRIPTION_FIELDS;
  const parts: string[] = [];
  for (const field of fields) {
    const value = (msg as unknown as Record<string, unknown>)[field];
    if (value === undefined || value === null) continue;
    parts.push(`${field}\n${String(value)}\n`);
  }
  return parts.join('');
}

export type SnsMessage = {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: '1' | '2';
  Signature: string;
  SigningCertURL: string;
  // Subscription-only :
  Token?: string;
  SubscribeURL?: string;
};

/**
 * Vérifie qu'un message SNS est authentique (signé par AWS).
 * Throw avec un message explicit si fail — ne return jamais false ambigu.
 *
 * Pour tests unit : injecter un fetcher custom via `certFetcher` (sinon
 * on hit le vrai SigningCertURL).
 */
export async function verifySnsSignature(
  msg: SnsMessage,
  opts: { certFetcher?: (url: string) => Promise<string> } = {},
): Promise<void> {
  if (msg.SignatureVersion !== '1' && msg.SignatureVersion !== '2') {
    throw new Error(`Unsupported SignatureVersion: ${msg.SignatureVersion}`);
  }

  const pem = await (opts.certFetcher ?? fetchSigningCert)(msg.SigningCertURL);
  const stringToSign = buildStringToSign(msg);
  // SignatureVersion 1 = RSA-SHA1, version 2 = RSA-SHA256.
  const algo = msg.SignatureVersion === '1' ? 'RSA-SHA1' : 'RSA-SHA256';

  const verifier = createVerify(algo);
  verifier.update(stringToSign, 'utf8');
  const ok = verifier.verify(pem, msg.Signature, 'base64');

  if (!ok) {
    throw new Error('SNS signature verification failed');
  }
}

/** Test-only : clear le cache (pour reset entre tests). */
export function _clearCertCacheForTests(): void {
  certCache.clear();
}
