/**
 * src/middleware.ts — Audit v2 #10.2.
 *
 * Le middleware est la SEULE barrière edge devant /admin/* (+ les routes
 * account-only). Il n'avait aucun test. On vérifie : gate admin (auth + role),
 * gate account, routes publiques laissées passer, et capture du cookie ?ref.
 *
 * Astuce : NextAuth(config).auth(handler) enveloppe le handler en injectant
 * req.auth. On mocke next-auth pour que `auth` soit l'identité → le default
 * export EST le handler, qu'on appelle avec un req mocké portant `.auth`.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('next-auth', () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}));
vi.mock('@/auth.config', () => ({ authConfig: {} }));

import middleware from '@/middleware';

type Session = { user?: { role?: 'USER' | 'ADMIN' } } | null;

function makeReq(pathname: string, opts: { auth?: Session; ref?: string; hasRefCookie?: boolean } = {}) {
  const url = `http://localhost${pathname}${opts.ref ? `?ref=${opts.ref}` : ''}`;
  return {
    nextUrl: { pathname, searchParams: new URL(url).searchParams },
    url,
    cookies: { get: (n: string) => (opts.hasRefCookie && n === 'plio_ref' ? { value: 'OLD' } : undefined) },
    auth: opts.auth ?? null,
  } as never;
}

// Le handler retourne NextResponse (redirect/next) ou undefined (continue).
function run(req: never): { status?: number; location?: string | null; cookieSet?: string } {
  const res = (middleware as unknown as (r: never) => unknown)(req) as
    | { status?: number; headers: { get: (k: string) => string | null }; cookies?: { get: (n: string) => { value: string } | undefined } }
    | undefined;
  if (!res) return {};
  return {
    status: res.status,
    location: res.headers?.get('location') ?? null,
    cookieSet: res.cookies?.get('plio_ref')?.value,
  };
}

describe('middleware — gate admin (#10.2)', () => {
  it('/admin sans auth → redirect /sign-in avec callbackUrl', () => {
    const { status, location } = run(makeReq('/admin'));
    expect(status).toBeGreaterThanOrEqual(300);
    expect(location).toContain('/sign-in');
    expect(location).toContain('callbackUrl=%2Fadmin');
  });

  it('/admin/orders avec auth mais role USER → redirect / NU (audit §2.2 : pas de flag révélateur)', () => {
    const { location } = run(makeReq('/admin/orders', { auth: { user: { role: 'USER' } } }));
    expect(location).toBeDefined();
    const url = new URL(location!);
    expect(url.pathname).toBe('/');
    // §2.2 — aucun paramètre qui révèle l'existence de la section admin.
    expect(url.search).toBe('');
  });

  it('/admin avec role ADMIN → passe (pas de redirect)', () => {
    const { status, location } = run(makeReq('/admin', { auth: { user: { role: 'ADMIN' } } }));
    expect(status).toBeUndefined();
    expect(location).toBeUndefined();
  });

  it('/admin avec auth SANS role (undefined) → traité comme non-admin → redirect / nu', () => {
    const { location } = run(makeReq('/admin', { auth: { user: {} } }));
    expect(location).toBeDefined();
    expect(new URL(location!).pathname).toBe('/');
    expect(new URL(location!).search).toBe('');
  });
});

describe('middleware — gate account-only (#10.2)', () => {
  it('/orders sans auth → redirect /sign-in', () => {
    const { location } = run(makeReq('/orders'));
    expect(location).toContain('/sign-in');
    expect(location).toContain('callbackUrl=%2Forders');
  });

  it('/wallet avec auth → passe', () => {
    const { status } = run(makeReq('/wallet', { auth: { user: { role: 'USER' } } }));
    expect(status).toBeUndefined();
  });

  it('route publique /templates → passe sans auth', () => {
    expect(run(makeReq('/templates')).status).toBeUndefined();
  });

  it('home / → passe', () => {
    expect(run(makeReq('/')).status).toBeUndefined();
  });
});

describe('middleware — capture ?ref (#10.2)', () => {
  it('?ref=CODE sur route publique → cookie plio_ref posé (normalisé majuscules)', () => {
    const { cookieSet } = run(makeReq('/', { ref: 'abc123' }));
    expect(cookieSet).toBe('ABC123');
  });

  it('?ref ignoré si cookie plio_ref existe déjà (first-touch)', () => {
    const { cookieSet } = run(makeReq('/', { ref: 'newref', hasRefCookie: true }));
    expect(cookieSet).toBeUndefined();
  });

  it('?ref trop court (< 5) → pas de cookie', () => {
    expect(run(makeReq('/', { ref: 'ab' })).cookieSet).toBeUndefined();
  });
});
