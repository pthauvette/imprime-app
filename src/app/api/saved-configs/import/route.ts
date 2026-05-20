/**
 * POST /api/saved-configs/import
 *
 * Round 20 #4 — importe un JSON export précédemment téléchargé.
 *
 * Body : le JSON export complet (cf /api/saved-configs/export).
 * - Validate version supportée (currently v1)
 * - Skip configs existantes (dedup par optionIds canonical sorted +
 *   productId, comme le POST normal le fait)
 * - Limite 200 configs par import (anti DoS)
 * - Returns { imported, skipped, errors }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';

const SUPPORTED_VERSIONS = [1] as const;
const MAX_CONFIGS_PER_IMPORT = 200;

const ConfigSchema = z.object({
  name: z.string().min(1).max(100),
  productId: z.number().int().positive(),
  productName: z.string().min(1).max(200),
  optionIds: z.string().min(1).max(500), // JSON-stringified array
  summary: z.string().min(1).max(300),
  folder: z.string().min(1).max(50).nullable().optional(),
  tags: z.string().max(300).nullable().optional(),
  timesUsed: z.number().int().nonnegative().optional(),
});

const ImportSchema = z.object({
  version: z.number().int().positive(),
  exportedAt: z.string().optional(),
  userEmail: z.string().optional(),
  configs: z.array(ConfigSchema).min(1).max(MAX_CONFIGS_PER_IMPORT),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const body = await parseBody(req, ImportSchema);

  if (!SUPPORTED_VERSIONS.includes(body.version as (typeof SUPPORTED_VERSIONS)[number])) {
    return NextResponse.json(
      {
        error: `Version ${body.version} non supportée (versions OK : ${SUPPORTED_VERSIONS.join(', ')})`,
        code: 'UNSUPPORTED_VERSION',
      },
      { status: 400 },
    );
  }

  // Charge les configs existantes (dédup par optionIds canonical + productId)
  const existing = await prisma.savedConfig.findMany({
    where: { userId: session.user.id },
    select: { productId: true, optionIds: true },
  });
  const existingKeys = new Set(existing.map((c) => `${c.productId}:${c.optionIds}`));

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ name: string; error: string }> = [];

  for (const config of body.configs) {
    // Normalize optionIds (resort pour matcher la canonical form)
    let sortedOptionIds: string;
    try {
      const parsed = JSON.parse(config.optionIds) as unknown;
      if (!Array.isArray(parsed) || !parsed.every((n) => typeof n === 'number')) {
        errors.push({ name: config.name, error: 'optionIds invalide' });
        continue;
      }
      sortedOptionIds = JSON.stringify([...parsed].sort((a, b) => a - b));
    } catch {
      errors.push({ name: config.name, error: 'optionIds non-JSON' });
      continue;
    }

    const dedupKey = `${config.productId}:${sortedOptionIds}`;
    if (existingKeys.has(dedupKey)) {
      skipped++;
      continue;
    }

    try {
      await prisma.savedConfig.create({
        data: {
          userId: session.user.id,
          name: config.name.trim(),
          productId: config.productId,
          productName: config.productName.trim(),
          optionIds: sortedOptionIds,
          summary: config.summary.trim(),
          folder: config.folder ? config.folder.toLowerCase().trim() : null,
          tags: config.tags ?? null,
          // timesUsed reset à 0 — on n'importe pas l'historique d'usage
          // (sinon le sort par fréquence serait biaisé après un import)
        },
      });
      existingKeys.add(dedupKey); // évite doublon intra-import
      imported++;
    } catch (err) {
      errors.push({
        name: config.name,
        error: err instanceof Error ? err.message.slice(0, 100) : 'unknown',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    errors,
    summary: `${imported} importée${imported > 1 ? 's' : ''}, ${skipped} skippée${skipped > 1 ? 's' : ''} (déjà existantes)${errors.length > 0 ? `, ${errors.length} erreur${errors.length > 1 ? 's' : ''}` : ''}`,
  });
});
