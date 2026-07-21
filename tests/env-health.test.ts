/**
 * config:env — inspection de la configuration au RUNTIME.
 *
 * Panne 2026-07-20 : des variables posées dans la console Amplify n'atteignaient
 * pas le runtime Lambda (absentes de la whitelist `amplify.yml`), donc
 * `undefined` sans la moindre erreur. L'opérateur les voyait dans la console et
 * croyait les avoir configurées ; le diagnostic a pris des heures.
 *
 * Deux garanties distinctes sont testées ici :
 *   1. l'inspection détecte bien l'absence (y compris la valeur VIDE) ;
 *   2. l'endpoint public ne DIVULGUE jamais les noms — seulement des comptes.
 *
 * Plus une garantie de cohérence : une variable que l'inspection déclare requise
 * DOIT pouvoir atteindre le runtime. Sinon le check crierait éternellement pour
 * une clé que le pipeline ne transmettra jamais — une alarme impossible à
 * éteindre, donc vite ignorée.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Dépendances de /api/health — on ne teste pas la santé des services ici, mais
// la forme de la réponse. Chacune répond « en panne » : c'est le pire cas pour
// la non-divulgation (les branches d'erreur sont celles qui recopient des
// messages bruts dans la réponse).
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: vi.fn(async () => { throw new Error('db down'); }),
    emailDelivery: { count: vi.fn(async () => 0) },
    webhookEvent: { count: vi.fn(async () => 0) },
  },
}));
vi.mock('@/lib/webhooks/dead-letter', () => ({
  countDeadLetterWebhooks: vi.fn(async () => ({ total: 0, bySource: {} })),
}));
vi.mock('stripe', () => {
  function StripeMock(this: unknown) {
    return { balance: { retrieve: vi.fn(async () => ({})) } };
  }
  return { default: StripeMock };
});
import { readFileSync } from 'node:fs';
import { inspectEnvConfig, REQUIRED_ENV_KEYS, GUARD_ENV_KEYS } from '@/lib/config/env-health';

const SNAPSHOT = { ...process.env };

beforeEach(() => {
  // Table rase : sinon le .env local du poste fausse les cas « absente ».
  for (const k of [...REQUIRED_ENV_KEYS, ...GUARD_ENV_KEYS]) delete process.env[k];
});

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in SNAPSHOT)) delete process.env[k];
  Object.assign(process.env, SNAPSHOT);
});

describe('inspectEnvConfig', () => {
  it('signale une variable requise absente', () => {
    const r = inspectEnvConfig();
    expect(r.missingRequired).toContain('DATABASE_URL');
    expect(r.missingRequired).toContain('DEFAULT_MARGIN_PCT');
  });

  it('une variable posée mais VIDE compte comme absente', () => {
    // Mode d'échec réel du pipeline `sed` d'amplify.yml : la clé existe dans
    // .env.production avec une valeur vide. Au runtime c'est indiscernable
    // d'une absence, et le traiter comme « présente » masquerait la panne.
    for (const k of REQUIRED_ENV_KEYS) process.env[k] = 'x';
    process.env.STRIPE_SECRET_KEY = '   ';
    expect(inspectEnvConfig().missingRequired).toEqual(['STRIPE_SECRET_KEY']);
  });

  it('tout est posé → rien ne manque', () => {
    for (const k of [...REQUIRED_ENV_KEYS, ...GUARD_ENV_KEYS]) process.env[k] = 'x';
    const r = inspectEnvConfig();
    expect(r.missingRequired).toEqual([]);
    expect(r.guardsInactive).toEqual([]);
    expect(r.failing).toBe(false);
  });

  it('un garde-fou inactif est RAPPORTÉ mais ne fait jamais échouer', () => {
    // Les garde-fous suivent un rollout délibéré (off → log → enforce) : les
    // traiter comme des erreurs ferait passer un déploiement voulu pour une panne.
    for (const k of REQUIRED_ENV_KEYS) process.env[k] = 'x';
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const r = inspectEnvConfig();
    (process.env as Record<string, string | undefined>).NODE_ENV = prev;

    expect(r.guardsInactive).toContain('ENFORCE_SHIPPING_SIG');
    expect(r.failing).toBe(false);
  });

  it("n'échoue qu'en PRODUCTION (en dev l'absence est normale)", () => {
    const prev = process.env.NODE_ENV;

    (process.env as Record<string, string>).NODE_ENV = 'development';
    expect(inspectEnvConfig().failing).toBe(false);

    (process.env as Record<string, string>).NODE_ENV = 'production';
    const enProd = inspectEnvConfig();

    (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    expect(enProd.failing).toBe(true);
    expect(enProd.missingRequired.length).toBeGreaterThan(0);
  });
});

describe('cohérence avec le pipeline de configuration', () => {
  const yml = readFileSync('amplify.yml', 'utf8');
  const whitelist = yml.match(/grep -E '\^\(([^)]+)\)'/)?.[1] ?? '';

  function couverte(key: string): boolean {
    return whitelist.split('|').some((p) => key === p || key.startsWith(p));
  }

  it('toute clé exigée par config:env peut réellement atteindre le runtime', () => {
    // Le lien qui manquait pendant la panne. Sans lui, on pourrait exiger une
    // variable que la whitelist d'amplify.yml n'exporte jamais vers
    // .env.production : le check échouerait en boucle sans correctif possible
    // côté console — l'opérateur la poserait, sans effet, indéfiniment.
    expect(whitelist.length).toBeGreaterThan(20); // le parsing a marché
    const orphelines = [...REQUIRED_ENV_KEYS, ...GUARD_ENV_KEYS].filter((k) => !couverte(k));
    expect(
      orphelines,
      `exigées par config:env mais absentes de la whitelist amplify.yml : ${orphelines.join(', ')}`,
    ).toEqual([]);
  });
});

describe('GET /api/health — non-divulgation', () => {
  it('la réponse publique expose des COMPTES, jamais les noms de variables', async () => {
    // L'endpoint est public. Publier « ENFORCE_SHIPPING_SIG est inactif »
    // renseignerait un attaquant sur exactement quelles gardes il peut ignorer.
    // On interroge la VRAIE route : asserter sur un objet reconstruit ici ne
    // prouverait rien de ce que la route renvoie réellement.
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const corps = await res.text();

    // Les compteurs sont bien là…
    const json = JSON.parse(corps);
    expect(json.checks['config:env'].detail).toHaveProperty('missingRequired');
    expect(typeof json.checks['config:env'].detail.missingRequired).toBe('number');

    // …et aucun nom de variable ne fuit, nulle part dans la réponse.
    for (const k of [...REQUIRED_ENV_KEYS, ...GUARD_ENV_KEYS]) {
      expect(corps, `« ${k} » fuite dans la réponse publique de /api/health`).not.toContain(k);
    }
  });
});
