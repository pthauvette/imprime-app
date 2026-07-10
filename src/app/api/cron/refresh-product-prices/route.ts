/**
 * GET /api/cron/refresh-product-prices
 *
 * Rafraîchit la table ProductStartingPrice (prix « à partir de » des listes
 * produits) par tranches : ~40 produits/run sous budget de temps, jamais-
 * calculés d'abord puis les plus vieux. Le catalogue complet (~178 produits)
 * converge en ~5 h au rythme horaire. Idempotent (upsert par productId).
 *
 * Auth : header `Authorization: Bearer ${CRON_SECRET}`.
 * Schedule : GitHub Actions horaire (cron-refresh-product-prices.yml).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { log } from '@/lib/logger';
import { pingCronHealthcheck } from '@/lib/cron/healthcheck';
import { recordCronRun } from '@/lib/cron/runs';
import { refreshStartingPrices } from '@/lib/products/starting-price-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req, 'refresh-product-prices');
  if (denied) return denied;

  const start = Date.now();
  try {
    const sweep = await refreshStartingPrices();
    const result = { ok: true, latencyMs: Date.now() - start, ...sweep };

    log.info(result, 'cron/refresh-product-prices ran');
    await pingCronHealthcheck('refresh-product-prices', 'success');
    await recordCronRun({
      name: 'refresh-product-prices',
      status: 'success',
      latencyMs: Date.now() - start,
      data: {
        totalEnabled: sweep.totalEnabled,
        computed: sweep.computed,
        priced: sweep.priced,
        failed: sweep.failed,
        remaining: sweep.remaining,
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'unknown';
    log.error({ err }, 'cron/refresh-product-prices failed');
    await pingCronHealthcheck('refresh-product-prices', 'fail', { error: errMsg });
    await recordCronRun({
      name: 'refresh-product-prices',
      status: 'fail',
      latencyMs: Date.now() - start,
      errorMessage: errMsg,
    });
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
