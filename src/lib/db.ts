/**
 * Singleton PrismaClient — partagé entre toutes les routes API.
 *
 * Next.js dev mode HMR recharge les modules à chaque change, ce qui crée des
 * connexions DB orphelines (et finit par exhauster le pool). On stash le
 * client dans `globalThis` pour le réutiliser entre rebuilds.
 *
 * En prod (serverless), chaque cold start a son propre process → pas de stash
 * nécessaire mais le pattern reste sûr.
 */

import { PrismaClient } from '@prisma/client';
import { withSlowQueryLog } from './db/slow-query-log';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Wrap with slow query log extension. $extends erode le type — cast vers
// PrismaClient préserve la surface API pour les call sites existants.
function makeClient(): PrismaClient {
  return withSlowQueryLog(
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    }),
  );
}

export const prisma = globalThis.__prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
