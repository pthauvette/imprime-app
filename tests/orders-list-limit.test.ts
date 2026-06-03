/**
 * GET /api/orders — Audit v2 #6.8 (clamp du paramètre limit).
 *
 * Sans cap, `?limit=999999` forçait un scan DB illimité. On borne [1,100].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn(async () => ({ user: { id: 'u_1' } })) }));
vi.mock('@/lib/db/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/orders')>('@/lib/db/orders');
  return { ...actual, listOrdersForUser: vi.fn(async () => []) };
});

import { auth } from '@/auth';
import { listOrdersForUser } from '@/lib/db/orders';

function get(qs: string) {
  return new Request(`http://localhost/api/orders?${qs}`);
}
async function call(qs: string) {
  const { GET } = await import('@/app/api/orders/route');
  return GET(get(qs) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u_1' } } as never);
  vi.mocked(listOrdersForUser).mockResolvedValue([] as never);
});

describe('GET /api/orders — clamp limit (#6.8)', () => {
  const limitOf = (call: number) =>
    (vi.mocked(listOrdersForUser).mock.calls[call]?.[0] as { limit?: number } | undefined)?.limit;

  it('limit énorme → clampé à 100', async () => {
    await call('limit=999999');
    expect(limitOf(0)).toBe(100);
  });

  it('limit normale conservée', async () => {
    await call('limit=25');
    expect(limitOf(0)).toBe(25);
  });

  it('limit 0 → plancher 1', async () => {
    await call('limit=0');
    expect(limitOf(0)).toBe(1);
  });

  it('limit absente → défaut 50', async () => {
    await call('');
    expect(limitOf(0)).toBe(50);
  });

  it('non authentifié → 401, pas de query', async () => {
    vi.mocked(auth).mockResolvedValueOnce(null as never);
    const res = await call('limit=10');
    expect(res.status).toBe(401);
    expect(listOrdersForUser).not.toHaveBeenCalled();
  });
});
