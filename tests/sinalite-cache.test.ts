/**
 * Tests pour withSinaliteCache : write-through + stale fallback.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    sinaliteCacheEntry: {
      findUnique: vi.fn(),
      upsert: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/alerting/slack', () => ({
  sendCriticalAlert: vi.fn(async () => {}),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: noop, error: noop, fatal: noop, debug: noop };
  return {
    logSinalite: stub,
    log: stub, logStripe: stub, logAuth: stub, logEmail: stub,
    logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

import { prisma } from '@/lib/db';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { withSinaliteCache, readCache, writeCache } from '@/lib/sinalite/cache';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withSinaliteCache — fresh path', () => {
  it('retourne le résultat du fetcher et écrit en cache', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.upsert).mockResolvedValueOnce({} as never);

    const fetcher = vi.fn(async () => ({ products: [{ id: 1, name: 'X' }] }));
    const result = await withSinaliteCache('/product', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ products: [{ id: 1, name: 'X' }] });

    // Write-through async — wait microtask
    await new Promise((r) => setImmediate(r));
    expect(prisma.sinaliteCacheEntry.upsert).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.sinaliteCacheEntry.upsert).mock.calls[0][0];
    expect(call.where).toEqual({ key: '/product' });
    expect(call.create.payload).toBe(JSON.stringify({ products: [{ id: 1, name: 'X' }] }));
  });

  it('readOnly skip le write', async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    await withSinaliteCache('/k', fetcher, { readOnly: true });

    await new Promise((r) => setImmediate(r));
    expect(prisma.sinaliteCacheEntry.upsert).not.toHaveBeenCalled();
  });

  it('si le write cache fail, retourne quand même les fresh data', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.upsert).mockRejectedValueOnce(new Error('DB down'));

    const fetcher = vi.fn(async () => ({ x: 42 }));
    const result = await withSinaliteCache('/k', fetcher);

    expect(result).toEqual({ x: 42 });
  });
});

describe('withSinaliteCache — stale fallback', () => {
  it('si fetcher fail et cache disponible : retourne stale + Slack alert', async () => {
    const cachedAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce({
      payload: JSON.stringify({ products: ['cached'] }),
      updatedAt: cachedAt,
    } as never);

    const fetcher = vi.fn(async () => {
      throw new Error('Sinalite 502');
    });

    const result = await withSinaliteCache('/product', fetcher);

    expect(result).toEqual({ products: ['cached'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sendCriticalAlert).toHaveBeenCalledTimes(1);
    const alert = vi.mocked(sendCriticalAlert).mock.calls[0][0];
    expect(alert.severity).toBe('warning');
    expect(alert.title).toMatch(/Sinalite/);
  });

  it('si fetcher fail et pas de cache : re-throw', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce(null);

    const fetcher = vi.fn(async () => {
      throw new Error('Sinalite 502');
    });

    await expect(withSinaliteCache('/no-cache', fetcher)).rejects.toThrow('Sinalite 502');
    expect(sendCriticalAlert).not.toHaveBeenCalled();
  });

  it('throttle Slack alerts : 2 stales rapprochés = 1 seul alert', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValue({
      payload: JSON.stringify({ ok: 1 }),
      updatedAt: new Date(),
    } as never);

    const fetcher = vi.fn(async () => {
      throw new Error('down');
    });

    // Reset module state so throttle starts fresh per test
    // (note : stats are module-level, persistent across tests in same file —
    // throttle est dans le module, on accepte cette limite et on teste la
    // sémantique en un seul call)
    await withSinaliteCache('/k', fetcher);
    const callCount = vi.mocked(sendCriticalAlert).mock.calls.length;

    // 2nd call within throttle window
    await withSinaliteCache('/k', fetcher);
    expect(vi.mocked(sendCriticalAlert).mock.calls.length).toBe(callCount);
  });
});

describe('readCache / writeCache primitives', () => {
  it('writeCache upsert via prisma', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.upsert).mockResolvedValueOnce({} as never);
    await writeCache('foo', { bar: 1 });
    const call = vi.mocked(prisma.sinaliteCacheEntry.upsert).mock.calls[0][0];
    expect(call.create).toEqual({ key: 'foo', payload: '{"bar":1}', statusCode: 200 });
  });

  it('readCache retourne null si row inexistante', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce(null);
    const r = await readCache('missing');
    expect(r).toBeNull();
  });

  it('readCache parse le JSON payload', async () => {
    const now = new Date();
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce({
      payload: '{"x":42}',
      updatedAt: now,
    } as never);
    const r = await readCache<{ x: number }>('k');
    expect(r).toEqual({ payload: { x: 42 }, updatedAt: now });
  });

  it('readCache retourne null si parse JSON fail', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce({
      payload: '{ malformed',
      updatedAt: new Date(),
    } as never);
    const r = await readCache('k');
    expect(r).toBeNull();
  });
});

// Round 36 #3 — TTL fast-path tests
describe('withSinaliteCache — TTL fast-path (Round 36 #3)', () => {
  it('cache hit dans TTL → retourne cached, SKIP le fetcher (perf win)', async () => {
    const recentlyCached = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce({
      payload: JSON.stringify({ products: ['cached_recent'] }),
      updatedAt: recentlyCached,
    } as never);

    const fetcher = vi.fn(async () => ({ products: ['fresh'] }));
    const result = await withSinaliteCache('/product', fetcher, { ttlMs: 10 * 60 * 1000 });

    expect(result).toEqual({ products: ['cached_recent'] });
    expect(fetcher).not.toHaveBeenCalled(); // KEY assertion : skip live fetch
  });

  it('cache hit hors TTL → fetch fresh + ignore stale', async () => {
    const oldCached = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce({
      payload: JSON.stringify({ products: ['stale'] }),
      updatedAt: oldCached,
    } as never);

    const fetcher = vi.fn(async () => ({ products: ['fresh'] }));
    const result = await withSinaliteCache('/product', fetcher, { ttlMs: 10 * 60 * 1000 });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ products: ['fresh'] });
  });

  it('cache miss avec TTL → fetch fresh normalement', async () => {
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce(null);
    const fetcher = vi.fn(async () => ({ products: ['fresh'] }));
    const result = await withSinaliteCache('/product', fetcher, { ttlMs: 10 * 60 * 1000 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ products: ['fresh'] });
  });

  it('sans ttlMs (legacy) → comportement inchangé (toujours fetch)', async () => {
    // PAS de mock findUnique : sans ttlMs, le code ne devrait pas appeler
    // findUnique en fast-path. Si on en ajoutait un avec mockResolvedValueOnce,
    // il fuiterait au test suivant (vi.clearAllMocks ne flush pas la queue).
    const fetcher = vi.fn(async () => ({ fresh: true }));
    const result = await withSinaliteCache('/k', fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result).toEqual({ fresh: true });
    // Vérif clé : findUnique pas appelé du tout en legacy mode
    expect(prisma.sinaliteCacheEntry.findUnique).not.toHaveBeenCalled();
  });

  it('TTL fast-path + fetcher fail → cache hit prend précédence (pas d\'appel fetcher du tout)', async () => {
    const recentlyCached = new Date(Date.now() - 1 * 60 * 1000);
    vi.mocked(prisma.sinaliteCacheEntry.findUnique).mockResolvedValueOnce({
      payload: JSON.stringify({ from: 'cache' }),
      updatedAt: recentlyCached,
    } as never);

    // Fetcher throws — should never be called
    const fetcher = vi.fn(async () => { throw new Error('Sinalite down'); });
    const result = await withSinaliteCache('/k', fetcher, { ttlMs: 5 * 60 * 1000 });
    expect(result).toEqual({ from: 'cache' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
