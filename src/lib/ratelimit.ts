/**
 * Rate limiting via Upstash Redis (free tier, ~10k requests/jour).
 *
 * 3 buckets distincts pour les endpoints à risque :
 *   - upload: 10/min/IP  → anti-spam S3 cost (chaque presign coûte rien
 *     mais un attaquant peut générer 1000 URLs/s + upload des gros files)
 *   - signin: 5/15min/IP → anti-spam magic links vers des victims (SES
 *     quota cost + abus du nom Plio en phishing chain)
 *   - render: 30/min/IP → anti-spam PDF generation (Lambda compute cost,
 *     pdfme prend ~200ms par render)
 *
 * Si Upstash pas configuré (dev local), tout passe — pas de gate. Le rate
 * limit n'est qu'une protection production, pas une feature critique flow.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const enabled = !!(URL && TOKEN);

const redis = enabled
  ? new Redis({ url: URL!, token: TOKEN! })
  : null;

// Sliding window : plus précis qu'un fixed bucket. Si user fait 5 calls à
// 14:59:59 et 5 à 15:00:01, fixed bucket le laisse passer (deux buckets
// différents). Sliding non.
function makeLimiter(requests: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window),
    prefix: `plio:rl:${prefix}`,
    analytics: true, // Upstash dashboard montre les hits par bucket
  });
}

export const limiters = {
  upload: makeLimiter(10, '1 m', 'upload'),
  signin: makeLimiter(5, '15 m', 'signin'),
  render: makeLimiter(30, '1 m', 'render'),
  // Audit v2 #6.4 — /api/shipping/estimate proxie vers Sinalite (API payante)
  // sans auth ; on borne par IP pour éviter l'abus de coût.
  shipping: makeLimiter(20, '1 m', 'shipping'),
};

export type LimiterKey = keyof typeof limiters;

/**
 * Check le rate limit pour une key (généralement IP) sur un bucket donné.
 * Retourne soit { ok: true } pour continuer, soit { ok: false, response }
 * avec une NextResponse 429 prête à retourner.
 *
 * Usage dans une route :
 *   const ip = req.headers.get('x-forwarded-for') ?? 'anon';
 *   const limit = await rateLimit('upload', ip);
 *   if (!limit.ok) return limit.response;
 */
export async function rateLimit(
  bucket: LimiterKey,
  key: string,
): Promise<{ ok: true; remaining: number } | { ok: false; response: NextResponse }> {
  const limiter = limiters[bucket];
  // Si Upstash pas configuré, on let through (dev mode)
  if (!limiter) return { ok: true, remaining: 999 };

  const { success, limit, remaining, reset } = await limiter.limit(key);

  if (success) return { ok: true, remaining };

  const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return {
    ok: false,
    response: NextResponse.json(
      {
        error: 'Trop de requêtes — calme-toi un peu.',
        code: 'RATE_LIMITED',
        retryAfter: retryAfterSec,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(reset / 1000)),
        },
      },
    ),
  };
}

/**
 * Extract IP from Next.js request. CloudFront set x-forwarded-for, on
 * prend le premier (le vrai client, pas les proxies intermédiaires).
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'anon';
}
