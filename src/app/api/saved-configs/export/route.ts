/**
 * GET /api/saved-configs/export
 *
 * Round 20 #4 — exporte les saved configs du user courant au format JSON
 * downloadable. Use case : backup avant deletion, migrate dev→prod, partage.
 *
 * Format : { version, exportedAt, userEmail, configs: [...] }
 * - version : schema version (incrémenter si breaking change format)
 * - exportedAt : ISO datetime
 * - userEmail : pour audit en cas de re-import sur un autre compte
 * - configs : full SavedConfig rows (sans userId — re-attribué au re-import)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

const EXPORT_SCHEMA_VERSION = 1;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const configs = await prisma.savedConfig.findMany({
    where: { userId: session.user.id },
    orderBy: [{ folder: 'asc' }, { createdAt: 'asc' }],
  });

  const exportData = {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    userEmail: session.user.email,
    configCount: configs.length,
    configs: configs.map((c) => ({
      name: c.name,
      productId: c.productId,
      productName: c.productName,
      optionIds: c.optionIds,
      summary: c.summary,
      folder: c.folder,
      tags: c.tags,
      timesUsed: c.timesUsed,
      // userId omitted — sera ré-attribué à l'import au user qui import
      // id + createdAt + updatedAt + lastUsedAt omitted — nouvelles rows à l'import
    })),
  };

  const filename = `plio-configs-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-cache',
    },
  });
}
