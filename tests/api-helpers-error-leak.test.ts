/**
 * withErrorHandler — Audit v2 #6.6 (pas de fuite d'infos sensibles au client).
 *
 * Verrouille : SinaliteError → message générique + AUCUN endpoint/body Sinalite
 * exposé ; Error générique → message brut masqué en PROD (loggé serveur) ;
 * ZodError → 400 VALIDATION inchangé.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  return { log: { info: noop, warn: noop, error: noop, fatal: noop, debug: noop } };
});

import { withErrorHandler } from '@/lib/api-helpers';
import { SinaliteError } from '@/lib/sinalite/client';

afterEach(() => {
  vi.unstubAllEnvs();
});
function setNodeEnv(v: string) {
  vi.stubEnv('NODE_ENV', v);
}

describe('withErrorHandler — #6.6 anti-fuite', () => {
  it('SinaliteError → message générique, AUCUN endpoint/body/details exposé', async () => {
    const handler = withErrorHandler(async () => {
      throw new SinaliteError('Auth token rejected for /price', 500, '/api/price', {
        secretHint: 'internal',
      });
    });
    const res = await handler();
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe('SINALITE_ERROR');
    expect(json.error).not.toContain('/api/price'); // endpoint masqué
    expect(json.error).not.toContain('Auth token'); // message brut masqué
    expect(json.details).toBeUndefined(); // ni body ni endpoint
    expect(JSON.stringify(json)).not.toContain('secretHint'); // body interne jamais sérialisé
  });

  it('SinaliteError status 200 (Sinalite 200 + body non conforme) → JAMAIS 2xx, remappé en 502', async () => {
    // Régression checkout /order/shipping (2026-07) : Sinalite répond HTTP 200
    // avec un body erreur/non conforme → le client throw SinaliteError(status=200).
    // Sans garde, withErrorHandler renvoyait 200 → res.ok=true côté front →
    // setMethods(undefined) → methods.find() crash (écran blanc, checkout bloqué).
    const handler = withErrorHandler(async () => {
      throw new SinaliteError('shippingEstimate → schema mismatch', 200, '/order/shippingEstimate', {});
    });
    const res = await handler();
    expect(res.status).toBe(502);
    expect(res.status).toBeGreaterThanOrEqual(400); // une erreur n'est JAMAIS un succès
    expect((await res.json()).code).toBe('SINALITE_ERROR');
  });

  it('SinaliteError status 4xx (combo invalide) → conservé tel quel (le client peut distinguer)', async () => {
    const handler = withErrorHandler(async () => {
      throw new SinaliteError('bad combo', 400, '/order/shippingEstimate');
    });
    expect((await handler()).status).toBe(400);
  });

  it('Error générique en PROD → message brut masqué', async () => {
    setNodeEnv('production');
    const handler = withErrorHandler(async () => {
      throw new Error('Connection to db-prod-1.internal:5432 failed: password authentication');
    });
    const res = await handler();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('INTERNAL');
    expect(json.error).toBe('Une erreur interne est survenue.');
    expect(json.error).not.toContain('db-prod-1.internal'); // pas de fuite infra
  });

  it('Error générique hors-prod → message conservé (DX)', async () => {
    setNodeEnv('development');
    const handler = withErrorHandler(async () => {
      throw new Error('boom détaillé pour debug');
    });
    const json = await (await handler()).json();
    expect(json.error).toBe('boom détaillé pour debug');
  });

  it('ZodError → 400 VALIDATION inchangé', async () => {
    const handler = withErrorHandler(async () => {
      z.object({ x: z.number() }).parse({ x: 'nope' });
      return null as never;
    });
    const res = await handler();
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION');
  });
});
