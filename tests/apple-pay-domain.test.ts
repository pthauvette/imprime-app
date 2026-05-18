/**
 * Tests pour /.well-known/apple-developer-merchantid-domain-association.
 *
 * Vérifie 404 quand pas configuré, et 200 + body quand env var set.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function importGet() {
  vi.resetModules();
  return (
    await import(
      '@/app/.well-known/apple-developer-merchantid-domain-association/route'
    )
  ).GET;
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /.well-known/apple-developer-merchantid-domain-association', () => {
  it('404 si APPLE_PAY_DOMAIN_ASSOCIATION pas set', async () => {
    vi.stubEnv('APPLE_PAY_DOMAIN_ASSOCIATION', '');
    const GET = await importGet();
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('200 + body texte si env var set', async () => {
    const blob = '7B227073704964223A2241383..real_blob_from_stripe..';
    vi.stubEnv('APPLE_PAY_DOMAIN_ASSOCIATION', blob);
    const GET = await importGet();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain');
    const body = await res.text();
    expect(body).toBe(blob);
  });

  it('Cache-Control public mais court (60s) pour permettre regen rapide', async () => {
    vi.stubEnv('APPLE_PAY_DOMAIN_ASSOCIATION', 'x');
    const GET = await importGet();
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toMatch(/public/);
    expect(res.headers.get('Cache-Control')).toMatch(/max-age=60/);
  });
});
