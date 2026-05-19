/**
 * Tests pour withSlowQueryLog + getSlowQueryStats.
 *
 * On simule un PrismaClient via mock du $extends — vérifie que les
 * queries lentes sont loguées + tracked dans les stats.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const warnSpy = vi.fn();

vi.mock('@/lib/logger', () => {
  const noop = () => undefined;
  const stub = { info: noop, warn: warnSpy, error: noop, fatal: noop, debug: noop };
  return {
    log: stub, logStripe: stub, logSinalite: stub, logAuth: stub,
    logEmail: stub, logS3: stub, logAdmin: stub, logWebhook: stub,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  warnSpy.mockClear();
});

async function importLib() {
  vi.resetModules();
  return await import('@/lib/db/slow-query-log');
}

/**
 * Mock PrismaClient juste assez pour tester $extends — il appelle le
 * `query` callback qu'on fournit, simule un delay, et on observe le log.
 */
function makeFakeClient(simulateDelayMs: number) {
  return {
    $extends({ query }: { query: { $allOperations: (args: { model: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown> } }) {
      const wrapped = {
        async runOp(model: string, operation: string) {
          return query.$allOperations({
            model,
            operation,
            args: {},
            query: async () => {
              await new Promise((r) => setTimeout(r, simulateDelayMs));
              return { ok: true };
            },
          });
        },
      };
      return wrapped;
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

describe('withSlowQueryLog', () => {
  it('ne log PAS une query rapide < threshold', async () => {
    const { withSlowQueryLog } = await importLib();
    const fake = makeFakeClient(5); // 5ms ≪ 200ms threshold
    const wrapped = withSlowQueryLog(fake) as unknown as { runOp: (m: string, o: string) => Promise<unknown> };
    await wrapped.runOp('Order', 'findMany');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('log + tracks une query > threshold', async () => {
    const { withSlowQueryLog, getSlowQueryStats } = await importLib();
    const fake = makeFakeClient(220); // 220ms > 200ms
    const wrapped = withSlowQueryLog(fake) as unknown as { runOp: (m: string, o: string) => Promise<unknown> };
    await wrapped.runOp('Order', 'findMany');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0][0] as { model: string; operation: string; durationMs: number };
    expect(args.model).toBe('Order');
    expect(args.operation).toBe('findMany');
    expect(args.durationMs).toBeGreaterThanOrEqual(200);

    const stats = getSlowQueryStats();
    expect(stats.slow).toBeGreaterThanOrEqual(1);
  });

  it('threshold respecté quand env SLOW_QUERY_THRESHOLD_MS set', async () => {
    vi.stubEnv('SLOW_QUERY_THRESHOLD_MS', '50');
    const { withSlowQueryLog, SLOW_QUERY_THRESHOLD_MS } = await importLib();
    expect(SLOW_QUERY_THRESHOLD_MS).toBe(50);
    const fake = makeFakeClient(80); // 80 > 50
    const wrapped = withSlowQueryLog(fake) as unknown as { runOp: (m: string, o: string) => Promise<unknown> };
    await wrapped.runOp('User', 'count');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it('log même si la query throw (pour repérer les timeouts lents)', async () => {
    const { withSlowQueryLog } = await importLib();
    const fake = {
      $extends({ query }: { query: { $allOperations: (args: { model: string; operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) => Promise<unknown> } }) {
        return {
          async runOp(model: string, operation: string) {
            return query.$allOperations({
              model,
              operation,
              args: {},
              query: async () => {
                await new Promise((r) => setTimeout(r, 220));
                throw new Error('connection timeout');
              },
            });
          },
        };
      },
    } as unknown as import('@prisma/client').PrismaClient;

    const wrapped = withSlowQueryLog(fake) as unknown as { runOp: (m: string, o: string) => Promise<unknown> };
    await expect(wrapped.runOp('Order', 'findMany')).rejects.toThrow('connection timeout');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const args = warnSpy.mock.calls[0][0] as { error: boolean };
    expect(args.error).toBe(true);
  });
});

describe('getSlowQueryStats', () => {
  it('expose un snapshot read-only', async () => {
    const { getSlowQueryStats } = await importLib();
    const stats = getSlowQueryStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('slow');
    expect(stats).toHaveProperty('verySlow');
  });
});
