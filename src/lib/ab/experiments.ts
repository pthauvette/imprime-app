/**
 * A/B testing infra — léger, cookie-based, server-first.
 *
 * Pas de SDK externe (LaunchDarkly, GrowthBook, Optimizely) pour MVP —
 * on a ~200 visiteurs/jour, l'overhead ne se justifie pas. Quand on aura
 * besoin de targeting complexe (segments, multi-variant exposure tracking,
 * stats engine), on migrera vers GrowthBook self-hosted.
 *
 * Comment ça marche :
 *   1. Chaque expérience a un id (ex: 'hero-headline-v2') + des variants
 *      avec poids relatifs.
 *   2. Au premier render, on assigne un variant (weighted random) et on
 *      écrit le cookie plio_ab_<id> pour 90 jours → sticky.
 *   3. Server Components lisent le cookie via getServerVariant().
 *   4. Pour mesurer : log via logger.info({ experiment, variant }) à chaque
 *      assignement. Future : table AnalyticsEvent + dashboard.
 *
 * Limites MVP :
 *   - Pas de targeting par segment (geo, plan, etc.) — pure random
 *   - Pas de bayesian stats — admin compare les conversion rates manually
 *   - L'assignation côté Server Component requires un write au response
 *     header, donc on accepte une race condition : si user a un cookie,
 *     on l'honore; sinon on assigne + write côté Server Action ou un
 *     middleware. Pour l'instant : helper hybride server + cookie-store.
 */

import { cookies } from 'next/headers';
import { cache } from 'react';
import { prisma } from '@/lib/db';

const COOKIE_PREFIX = 'plio_ab_';
/** 90 jours — assez long pour mesurer même une conversion lente. */
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
/** Cookie anonyme pour identifier un visiteur à travers les sessions.
 *  Permet d'attribuer les conversions aux assignments même pour les
 *  user pas loggés (= 90 % des visiteurs landing). */
const VISITOR_COOKIE = 'plio_vid';
const VISITOR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 an

/** Génère un visitor ID cuid-style (pas crypto-secure, juste unique). */
function generateVisitorId(): string {
  return 'vis_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export interface Variant {
  /** Identifier court, ASCII safe (sera dans le cookie). */
  id: string;
  /** Label admin-facing. */
  label: string;
  /** Poids relatif. 50/50 = 1+1. 70/30 = 7+3. */
  weight: number;
}

export interface Experiment {
  /** Identifier unique kebab-case. Va dans le cookie name. */
  id: string;
  /** Description for admin / docs. */
  label: string;
  /** ISO date string — quand l'expérience a commencé (pour dashboard). */
  startedAt: string;
  /** Variants. Le premier est typically le "control". */
  variants: [Variant, Variant, ...Variant[]];
  /** Active = on assigne. Inactive = tout le monde tombe sur le 1er
   *  variant (control) sans écrire de cookie. */
  active: boolean;
}

/**
 * Registry des expériences actives. Pour démarrer une nouvelle expérience :
 *   1. Ajoute une entry ici avec active: true
 *   2. Utilise getServerVariant(id) dans la Server Component cible
 *   3. Branch sur variant.id pour rendre la version A ou B
 *   4. Pour conclure : passe active à false. Tout le monde voit le control.
 */
export const EXPERIMENTS = {
  // Exemple seed — à remplacer/ajouter selon les tests réels.
  'hero-headline-v1': {
    id: 'hero-headline-v1',
    label: 'Hero homepage : "Imprime ce que tu veux" vs "Print qualité pro, livraison Canada"',
    startedAt: '2026-05-18',
    variants: [
      { id: 'control', label: 'Imprime ce que tu veux, en 2 minutes', weight: 50 },
      { id: 'variant_b', label: 'Print qualité pro, livraison Canada', weight: 50 },
    ],
    active: false,
  },
} as const satisfies Record<string, Experiment>;

export type ExperimentId = keyof typeof EXPERIMENTS;

/**
 * Sélectionne un variant pondéré aléatoirement parmi les variants d'une
 * expérience. Pure function — pas de side effect. Pour reproductible :
 *   - Si on passe `seed`, on dérive un random déterministe (utile pour
 *     les tests + pour assigner la même variant à un user logged-in si
 *     on a userId).
 */
export function pickVariant(experiment: Experiment, seed?: string): Variant {
  const totalWeight = experiment.variants.reduce((s, v) => s + v.weight, 0);
  if (totalWeight <= 0) return experiment.variants[0];

  const r = seed !== undefined ? seededRandom(seed) : Math.random();
  const target = r * totalWeight;
  let cumulative = 0;
  for (const v of experiment.variants) {
    cumulative += v.weight;
    if (target < cumulative) return v;
  }
  // Fallback (shouldn't happen if weights > 0)
  return experiment.variants[experiment.variants.length - 1];
}

/**
 * Hash-based pseudo-random number generator (0..1) à partir d'un seed
 * string. Pour assigner la même variant à un user/visitor identifié de
 * manière déterministe (rather than re-rolling chaque page load).
 *
 * Algo : FNV-1a 32-bit puis modulo. Pas crypto-secure (et c'est OK,
 * c'est de l'A/B pas de la sécurité).
 */
export function seededRandom(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Convert to 0..1
  return (hash >>> 0) / 0xffffffff;
}

/**
 * Runtime view d'une expérience : merge la définition code-defined avec
 * l'override admin en DB (ExperimentOverride). Permet à l'admin de
 * toggle `active` ou de shift les poids sans redeploy.
 *
 * `source` indique d'où vient le `active` flag actuel pour audit dans le
 * admin dashboard. cache() dédupe l'appel DB par requête React.
 */
export interface ExperimentRuntime extends Experiment {
  /** Code default vs override DB — utile dans /admin/experiments. */
  source: 'code' | 'override';
  /** Quand l'override a été modifié (si applicable). */
  overrideUpdatedAt?: Date;
  /** Qui a fait le dernier change. */
  overrideUpdatedBy?: string;
}

/**
 * Résout la config runtime d'une expérience. cache() = 1 query DB par
 * id, par requête React, peu importe combien de Server Components la
 * demandent.
 */
export const getExperimentRuntime = cache(
  async <I extends ExperimentId>(experimentId: I): Promise<ExperimentRuntime> => {
    const base = EXPERIMENTS[experimentId];
    let override: {
      active: boolean;
      weightsJson: string | null;
      updatedAt: Date;
      updatedBy: string | null;
    } | null = null;
    try {
      override = await prisma.experimentOverride.findUnique({
        where: { experimentId: experimentId as string },
        select: { active: true, weightsJson: true, updatedAt: true, updatedBy: true },
      });
    } catch {
      // Migration not applied yet / DB down → fallback code default
      return { ...base, source: 'code' };
    }

    if (!override) return { ...base, source: 'code' };

    // Optional weight override : merge if valid JSON, sinon ignore.
    // Cast via unknown : `as const satisfies` rend base.variants littéralement
    // typé, mais on retourne juste un Experiment runtime — pas un literal.
    let variants: Experiment['variants'] = base.variants as unknown as Experiment['variants'];
    if (override.weightsJson) {
      try {
        const parsed = JSON.parse(override.weightsJson) as Record<string, number>;
        const mapped = base.variants.map((v) => ({
          id: v.id,
          label: v.label,
          weight:
            typeof parsed[v.id] === 'number' && parsed[v.id] >= 0
              ? parsed[v.id]
              : v.weight,
        }));
        variants = mapped as unknown as Experiment['variants'];
      } catch {
        // Malformed JSON → use code defaults
      }
    }

    return {
      ...(base as unknown as Experiment),
      active: override.active,
      variants,
      source: 'override',
      overrideUpdatedAt: override.updatedAt,
      overrideUpdatedBy: override.updatedBy ?? undefined,
    };
  },
);

/**
 * Server-side : lit le variant assigné pour cet experiment depuis le
 * cookie. Honore l'override admin DB via getExperimentRuntime.
 *
 * Si expérience inactive : retourne toujours le control (1er variant).
 */
export async function getServerVariant<I extends ExperimentId>(
  experimentId: I,
): Promise<Variant> {
  const experiment = await getExperimentRuntime(experimentId);
  if (!experiment.active) return experiment.variants[0];

  const store = await cookies();
  const cookieName = COOKIE_PREFIX + experimentId;

  // Visitor ID — anonyme, sticky 1 an. Permet d'attribuer conversions
  // même aux user pas loggés.
  let visitorId = store.get(VISITOR_COOKIE)?.value;
  if (!visitorId) {
    visitorId = generateVisitorId();
    try {
      store.set(VISITOR_COOKIE, visitorId, {
        maxAge: VISITOR_COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
      });
    } catch {
      // Server Component context — pas grave, l'assignment de cette session
      // ne sera juste pas trackée. Visiteur aura un nouveau ID au prochain load.
    }
  }

  const cookie = store.get(cookieName);
  if (cookie) {
    const found = experiment.variants.find((v) => v.id === cookie.value);
    if (found) {
      // Pas de re-log — assignment déjà tracké au 1er render
      return found;
    }
  }

  // Pas de cookie ou cookie invalide → on pick + write si on peut.
  const variant = pickVariant(experiment);
  try {
    store.set(cookieName, variant.id, {
      maxAge: COOKIE_MAX_AGE,
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // lisible client-side pour les analytics
    });
  } catch {
    // ignore — Server Component context
  }

  // Log l'assignment — non-throwing (catch interne, P2002 dédupe). On AWAIT :
  // un `void` serait gelé sur Lambda (suite #322/#323). getServerVariant n'a pas
  // d'appelant en prod aujourd'hui → impact latence nul.
  await recordAssignment(experimentId, variant.id, visitorId);

  return variant;
}

/** Insert ou skip si déjà présent (UNIQUE constraint dedup). */
async function recordAssignment(
  experimentId: string,
  variantId: string,
  visitorId: string,
): Promise<void> {
  try {
    await prisma.experimentAssignment.create({
      data: { experimentId, variantId, visitorId },
    });
  } catch {
    // P2002 unique constraint (déjà assigné) ou DB down → silent skip
  }
}

/**
 * Log une conversion pour un goal donné. À appeler depuis :
 *   - API routes après une action de succès (order placed, signup)
 *   - Server Actions
 *
 * Conversion = N par visiteur (un user qui fait 3 commandes = 3 conversions
 * pour le goal 'order_placed'). Sera dédupé côté analytics si besoin.
 *
 * `experimentIds` optionnel : si vide, on log la conversion pour TOUS les
 * experiments actifs où ce visiteur a un assignment (auto-attribution).
 */
export async function recordConversion(input: {
  visitorId: string;
  goal: string;
  value?: number;
  userId?: string;
  /** Si fourni, force l'attribution sur ces exp IDs uniquement. Sinon
   *  on auto-détecte via les assignments existants du visiteur. */
  experimentIds?: string[];
}): Promise<void> {
  if (!input.visitorId) return;
  try {
    const assignments = input.experimentIds
      ? await prisma.experimentAssignment.findMany({
          where: {
            visitorId: input.visitorId,
            experimentId: { in: input.experimentIds },
          },
          select: { experimentId: true, variantId: true },
        })
      : await prisma.experimentAssignment.findMany({
          where: { visitorId: input.visitorId },
          select: { experimentId: true, variantId: true },
        });

    if (assignments.length === 0) return;

    await prisma.experimentConversion.createMany({
      data: assignments.map((a) => ({
        experimentId: a.experimentId,
        variantId: a.variantId,
        visitorId: input.visitorId,
        userId: input.userId ?? null,
        goal: input.goal,
        value: input.value ?? null,
      })),
    });
  } catch {
    // Best-effort — pas grave si on perd un event
  }
}

/** Lit le visitor ID depuis le cookie store (server). Returns null si pas set. */
export async function getVisitorId(): Promise<string | null> {
  const store = await cookies();
  return store.get(VISITOR_COOKIE)?.value ?? null;
}

/** Helper sync : extract variant from a raw cookie value + experiment. */
export function variantFromCookie(experimentId: ExperimentId, cookieValue: string | undefined): Variant {
  const experiment = EXPERIMENTS[experimentId];
  if (!experiment.active) return experiment.variants[0];
  if (!cookieValue) return pickVariant(experiment);
  return experiment.variants.find((v) => v.id === cookieValue) ?? pickVariant(experiment);
}

export const AB_COOKIE_PREFIX = COOKIE_PREFIX;
export const AB_COOKIE_MAX_AGE = COOKIE_MAX_AGE;
