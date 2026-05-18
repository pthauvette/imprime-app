/**
 * Tests pour recordConversion + POST /api/ab/conversion + auto-attribution.
 *
 * getServerVariant + recordAssignment ne sont pas testés ici car next/headers
 * cookies() est complexe à mock — couverts par e2e Playwright (Round 10 #3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    experimentOverride: { findUnique: vi.fn(async () => null) },
    experimentAssignment: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({})),
    },
    experimentConversion: {
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

vi.mock('@/lib/ratelimit', () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => '1.2.3.4'),
}));

import { prisma } from '@/lib/db';
import { recordConversion } from '@/lib/ab/experiments';
import { cookies } from 'next/headers';
import { rateLimit } from '@/lib/ratelimit';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true } as never);
});

describe('recordConversion', () => {
  it('no-op si pas de visitorId', async () => {
    await recordConversion({ visitorId: '', goal: 'order_placed' });
    expect(prisma.experimentAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.experimentConversion.createMany).not.toHaveBeenCalled();
  });

  it('no-op si visiteur sans assignments', async () => {
    vi.mocked(prisma.experimentAssignment.findMany).mockResolvedValueOnce([]);
    await recordConversion({ visitorId: 'vis_123', goal: 'order_placed' });
    expect(prisma.experimentConversion.createMany).not.toHaveBeenCalled();
  });

  it('crée 1 conversion par assignment du visiteur (auto-attribution)', async () => {
    vi.mocked(prisma.experimentAssignment.findMany).mockResolvedValueOnce([
      { experimentId: 'hero-headline-v1', variantId: 'variant_b' },
      { experimentId: 'cta-color', variantId: 'control' },
    ] as never);

    await recordConversion({
      visitorId: 'vis_123',
      goal: 'order_placed',
      value: 10522,
      userId: 'user_1',
    });

    expect(prisma.experimentConversion.createMany).toHaveBeenCalledTimes(1);
    const call = vi.mocked(prisma.experimentConversion.createMany).mock.calls[0][0]!;
    const data = call.data as Array<{
      experimentId: string;
      variantId: string;
      visitorId: string;
      userId: string | null;
      goal: string;
      value: number | null;
    }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({
      experimentId: 'hero-headline-v1',
      variantId: 'variant_b',
      visitorId: 'vis_123',
      userId: 'user_1',
      goal: 'order_placed',
      value: 10522,
    });
    expect(data[1].experimentId).toBe('cta-color');
  });

  it('experimentIds filter : log only sur les exp listées', async () => {
    vi.mocked(prisma.experimentAssignment.findMany).mockResolvedValueOnce([
      { experimentId: 'hero-headline-v1', variantId: 'control' },
    ] as never);

    await recordConversion({
      visitorId: 'vis_123',
      goal: 'signup',
      experimentIds: ['hero-headline-v1'],
    });

    const findCall = vi.mocked(prisma.experimentAssignment.findMany).mock.calls[0][0];
    expect(findCall?.where).toEqual({
      visitorId: 'vis_123',
      experimentId: { in: ['hero-headline-v1'] },
    });
  });

  it('best-effort : si DB throw, no rethrow', async () => {
    vi.mocked(prisma.experimentAssignment.findMany).mockRejectedValueOnce(new Error('DB down'));
    await expect(
      recordConversion({ visitorId: 'vis_123', goal: 'x' }),
    ).resolves.toBeUndefined();
  });
});

describe('POST /api/ab/conversion', () => {
  async function importPost() {
    vi.resetModules();
    return (await import('@/app/api/ab/conversion/route')).POST;
  }

  it('no_visitor_id si pas de cookie', async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => undefined),
      set: vi.fn(),
    } as never);

    const POST = await importPost();
    const res = await POST(
      new Request('http://localhost/api/ab/conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'order_placed' }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tracked).toBe(false);
    expect(json.reason).toBe('no_visitor_id');
  });

  it('400 si goal invalide (uppercase / espaces)', async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'vis_xyz' })),
      set: vi.fn(),
    } as never);
    const POST = await importPost();
    const res = await POST(
      new Request('http://localhost/api/ab/conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'BAD GOAL' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('200 + tracked=true si visitor cookie présent + goal valide', async () => {
    vi.mocked(cookies).mockResolvedValueOnce({
      get: vi.fn(() => ({ value: 'vis_xyz' })),
      set: vi.fn(),
    } as never);
    vi.mocked(prisma.experimentAssignment.findMany).mockResolvedValueOnce([
      { experimentId: 'e1', variantId: 'v1' },
    ] as never);

    const POST = await importPost();
    const res = await POST(
      new Request('http://localhost/api/ab/conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'order_placed', value: 12345 }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tracked).toBe(true);
    expect(prisma.experimentConversion.createMany).toHaveBeenCalledTimes(1);
  });

  it('429 si rate-limit dépassé', async () => {
    const limitResp = new Response(JSON.stringify({ error: 'rate' }), { status: 429 });
    vi.mocked(rateLimit).mockResolvedValueOnce({ ok: false, response: limitResp } as never);
    const POST = await importPost();
    const res = await POST(
      new Request('http://localhost/api/ab/conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: 'x' }),
      }),
    );
    expect(res.status).toBe(429);
  });
});
