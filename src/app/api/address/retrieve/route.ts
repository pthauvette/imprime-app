/**
 * GET /api/address/retrieve?id=...
 *
 * Resolve un AddressFindResult.id en address structurée. Appelé après
 * que l'user clique sur une suggestion.
 *
 * Response : { ok: bool, address?: AddressDetail }
 */

import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api-helpers';
import { rateLimit, clientIp } from '@/lib/ratelimit';
import { retrieveAddress } from '@/lib/address/canadapost';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const limit = await rateLimit('render', clientIp(req));
  if (!limit.ok) return limit.response;

  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  const address = await retrieveAddress(id);
  if (!address) {
    return NextResponse.json({ ok: false, error: 'Address not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, address });
});
