/**
 * PATCH /api/admin/experiments/[id]
 *
 * Toggle l'override admin pour une expérience A/B. Upsert sur
 * ExperimentOverride : crée si pas existe, met à jour sinon. Audit log.
 *
 * Body : { active: boolean, weightsJson?: string | null }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';
import { EXPERIMENTS, type ExperimentId } from '@/lib/ab/experiments';

const BodySchema = z.object({
  active: z.boolean(),
  /** Optionnel : JSON string format `{ "variantId": weight }`. */
  weightsJson: z.string().max(2000).nullable().optional(),
});

export const PATCH = withErrorHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;

    const { id } = await ctx.params;
    if (!(id in EXPERIMENTS)) {
      return NextResponse.json(
        { error: `Expérience inconnue : ${id}` },
        { status: 404 },
      );
    }

    const body = await parseBody(req, BodySchema);

    // Validation optionnelle : si weightsJson set, doit parser en
    // Record<string, number> et chaque variant doit exister.
    if (body.weightsJson) {
      try {
        const parsed = JSON.parse(body.weightsJson) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
          return NextResponse.json({ error: 'weightsJson doit être un objet' }, { status: 400 });
        }
        const validVariantIds: Set<string> = new Set(
          EXPERIMENTS[id as ExperimentId].variants.map((v) => v.id as string),
        );
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (!validVariantIds.has(k)) {
            return NextResponse.json(
              { error: `variant inconnu : ${k}` },
              { status: 400 },
            );
          }
          if (typeof v !== 'number' || v < 0) {
            return NextResponse.json(
              { error: `weight invalide pour ${k} (doit être number >= 0)` },
              { status: 400 },
            );
          }
        }
      } catch (err) {
        return NextResponse.json(
          { error: `weightsJson JSON invalide : ${err instanceof Error ? err.message : 'parse error'}` },
          { status: 400 },
        );
      }
    }

    const previous = await prisma.experimentOverride.findUnique({
      where: { experimentId: id },
      select: { active: true },
    });

    await prisma.experimentOverride.upsert({
      where: { experimentId: id },
      create: {
        experimentId: id,
        active: body.active,
        weightsJson: body.weightsJson ?? null,
        updatedBy: guard.user.email,
      },
      update: {
        active: body.active,
        weightsJson: body.weightsJson ?? null,
        updatedBy: guard.user.email,
      },
    });

    await recordAdminAudit({
      kind: 'ADMIN_EXPERIMENT_TOGGLE',
      adminId: guard.userId,
      adminEmail: guard.user.email,
      targetType: 'EXPERIMENT',
      targetId: id,
      data: {
        previousActive: previous?.active ?? null,
        nextActive: body.active,
        weightsOverride: body.weightsJson ?? null,
      },
    });

    return NextResponse.json({ ok: true, experimentId: id, active: body.active });
  },
);
