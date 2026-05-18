/**
 * GET /api/address/autocomplete?q=...&lastId=...
 *
 * Proxy vers Canada Post Find API. On expose pas la clé côté browser
 * (server-side seulement). Rate-limit doux pour pas brûler le quota.
 *
 * Response : { available: bool, items: AddressFindResult[] }
 * Si Canada Post pas configuré : { available: false, items: [] }.
 */

import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { findAddresses, isAutocompleteAvailable } from '@/lib/address/canadapost';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const lastId = url.searchParams.get('lastId') ?? undefined;

  if (!isAutocompleteAvailable()) {
    return NextResponse.json({ available: false, items: [] });
  }

  const items = await findAddresses(q, lastId);
  return NextResponse.json({ available: true, items });
});
