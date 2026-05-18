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

const COOKIE_PREFIX = 'plio_ab_';
/** 90 jours — assez long pour mesurer même une conversion lente. */
const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

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
 * Server-side : lit le variant assigné pour cet experiment depuis le
 * cookie. Si pas assigné ET expérience active : retourne null (le
 * caller doit assigner via setVariantCookie côté response — typiquement
 * dans un middleware ou Server Action).
 *
 * Si expérience inactive : retourne toujours le control (1er variant).
 */
export async function getServerVariant<I extends ExperimentId>(
  experimentId: I,
): Promise<Variant> {
  const experiment = EXPERIMENTS[experimentId];
  if (!experiment.active) return experiment.variants[0];

  const store = await cookies();
  const cookieName = COOKIE_PREFIX + experimentId;
  const cookie = store.get(cookieName);
  if (cookie) {
    const found = experiment.variants.find((v) => v.id === cookie.value);
    if (found) return found;
  }
  // Pas de cookie ou cookie invalide → on pick + write si on peut.
  // cookies().set() peut throw dans un Server Component pur (pas dans
  // un Route Handler ou Server Action). On try/catch et retombe au pick
  // sans persist — le caller verra une nouvelle assignation au prochain
  // load. Acceptable pour MVP, à refactor via middleware si on veut
  // 100% sticky en pages statiques.
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
  return variant;
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
