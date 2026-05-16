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

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
