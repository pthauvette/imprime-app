import { NextResponse } from 'next/server';
import { sinalite } from '@/lib/sinalite/client';
import { applyProductOverrides } from '@/lib/products/overrides';
import { withErrorHandler } from '@/lib/api-helpers';

/**
 * GET /api/products
 *   Returns the full product catalogue, grouped by category.
 *   Query params:
 *     ?category=Business+Cards   filtre par catégorie
 *     ?enabled=true              filtre les produits actifs uniquement
 *
 * Cache: ce endpoint pourrait être ISR/SWR car le catalogue change rarement.
 * Pour l'instant, no-cache (force fresh à chaque appel).
 */
export const GET = withErrorHandler(async (req: Request) => {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const enabledOnly = url.searchParams.get('enabled') === 'true';

  const raw = await sinalite.listProducts();
  // Applique les overrides admin : hide disabled, applique displayName.
  // Note : on garde les Sinalite-disabled aussi puisque l'API publique sert
  // aussi le debug admin (filtré par ?enabled=true côté caller si voulu).
  const all = await applyProductOverrides(raw);

  let filtered = all;
  if (category) filtered = filtered.filter((p) => p.category === category);
  if (enabledOnly) filtered = filtered.filter((p) => p.enabled === 1);

  // Group by category for UI consumption
  const byCategory = filtered.reduce<Record<string, typeof filtered>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  return NextResponse.json({
    products: filtered,
    byCategory,
    total: filtered.length,
    categories: Object.keys(byCategory).sort(),
  });
});
