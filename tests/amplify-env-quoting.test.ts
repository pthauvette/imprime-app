/**
 * Verrou du pipeline de configuration Amplify → runtime.
 *
 * POURQUOI CE TEST EXISTE (panne 2026-07-20) : `amplify.yml` écrit
 * `.env.production` à partir de `env | grep …`. Écrite BRUTE, une valeur
 * contenant `#` voyait la suite traitée comme un commentaire par dotenv →
 * `DATABASE_URL` tronquée → « invalid port number » en prod, plusieurs heures
 * de diagnostic. La 1re correction (guillemets doubles) ne couvrait que le `#`.
 *
 * Ce test rejoue le `sed` RÉEL extrait d'`amplify.yml` contre le VRAI loader
 * `@next/env` (celui qui tourne en prod, et qui applique dotenv-expand) — donc
 * il teste le comportement, pas une reformulation du code.
 *
 * Le cas `$` est le plus important : non échappé, dotenv-expand l'interprète
 * comme une référence de variable et l'avale SILENCIEUSEMENT, produisant une URL
 * syntaxiquement VALIDE → erreur d'authentification opaque, bien pire que le `#`
 * qui, lui, échoue bruyamment.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// `@next/env` est une dépendance TRANSITIVE de `next` (pnpm strict → pas
// résolvable directement). On la résout depuis le paquet `next` : c'est
// exactement le loader qui tourne en production, pas une réimplémentation.
const requireFromNext = createRequire(createRequire(import.meta.url).resolve('next/package.json'));
const { loadEnvConfig } = requireFromNext('@next/env') as {
  loadEnvConfig: (dir: string, dev: boolean, logger: { info(): void; error(): void }, force: boolean) => void;
};

/** Extrait l'expression sed d'amplify.yml (celle qui quote les valeurs). */
function sedFromAmplifyYml(): string {
  const yml = readFileSync('amplify.yml', 'utf8');
  const m = yml.match(/\|\s*sed -E "([^"]+)"/);
  if (!m) throw new Error("sed de quoting introuvable dans amplify.yml — le pipeline a changé, adapter ce test");
  // Le YAML `- |` conserve les backslashes littéralement ; on retire seulement
  // le doublement introduit pour l'interpolation shell dans le bloc.
  return m[1].replace(/\\\\/g, '\\').replace(/\\\$/g, '$');
}

/** Passe `KEY=value` dans le sed, écrit un .env.production, et relit via @next/env. */
function roundTrip(key: string, value: string, sed: string): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'plio-env-'));
  const src = join(dir, 'in.txt');
  // Fichier (pas de shell) → aucune expansion parasite ne fausse le test.
  writeFileSync(src, `${key}=${value}`);
  const out = execFileSync('sed', ['-E', sed, src], { encoding: 'utf8' });
  writeFileSync(join(dir, '.env.production'), out.replace(/\n?$/, '\n'));

  delete process.env[key];
  const prevNodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = 'production';
  loadEnvConfig(dir, false, { info() {}, error() {} }, true);
  const got = process.env[key];
  (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv;
  return got;
}

describe('amplify.yml — quoting de .env.production', () => {
  const sed = sedFromAmplifyYml();

  // Mots de passe hostiles réalistes. Supabase/Stripe en génèrent avec des
  // caractères spéciaux ; chacun de ceux-ci a un mode de panne distinct.
  const motsDePasse = [
    ['simple123', 'alphanumérique (témoin)'],
    ['pa#ss', '# → commenté par dotenv (la panne d\'origine)'],
    ['pa$ss', '$ → avalé par dotenv-expand, URL reste VALIDE (le pire cas)'],
    ['pa"ss', '" → casse le quoting double'],
    ['pa\\ss', '\\ → doublé par un échappement naïf'],
    ['pa ss', 'espace → coupe la valeur non quotée'],
    ['p@s$w#rd\\x', 'combiné réaliste'],
  ] as const;

  it.each(motsDePasse)('préserve DATABASE_URL avec un mot de passe « %s » (%s)', (mdp) => {
    const url = `postgresql://u:${mdp}@h.co:6543/db?pgbouncer=true`;
    expect(roundTrip('DATABASE_URL', url, sed)).toBe(url);
  });

  it('la valeur relue reste une URL parsable avec un port (le symptôme de la panne)', () => {
    // Mot de passe hostile à dotenv (`$`) mais LÉGAL dans une URL.
    // ⚠️ Un `#` ou un `@` littéral dans un mot de passe rend l'URL invalide au
    // niveau URL lui-même (fragment / séparateur userinfo) — aucun quoting ne
    // peut le sauver, il DOIT être percent-encodé (`%23`, `%40`) côté Amplify.
    // C'est une contrainte distincte du quoting testé ci-dessus.
    const url = 'postgresql://u:pa$$w0rd@h.co:6543/db?pgbouncer=true';
    const got = roundTrip('DATABASE_URL', url, sed);
    expect(got).toBe(url);
    expect(new URL(got!).port).toBe('6543');
  });

  it('un `#` littéral produit une URL invalide — à percent-encoder (garde documentaire)', () => {
    // Verrouille la nuance ci-dessus : même parfaitement transporté par le
    // pipeline, un `#` brut casse le parsing d'URL. Si ce test échoue un jour,
    // c'est que le comportement de `new URL` a changé — revoir la consigne.
    const brut = 'postgresql://u:pa#ss@h.co:6543/db';
    // Le `#` démarre un fragment → il ne reste que `postgresql://u:pa`, sans
    // hôte valide → `new URL` LÈVE (elle ne retourne même pas un port vide).
    expect(() => new URL(brut)).toThrow();
    const encode = 'postgresql://u:pa%23ss@h.co:6543/db';
    expect(new URL(encode).port).toBe('6543');
  });
});

describe('amplify.yml — cohérence des whitelists d\'env', () => {
  const yml = readFileSync('amplify.yml', 'utf8');
  const whitelist = yml.match(/grep -E '\^\(([^)]+)\)'/)?.[1] ?? '';

  /** true si `key` est capturée par la whitelist (nom exact ou préfixe). */
  function couverte(key: string): boolean {
    return whitelist.split('|').some((p) => key === p || key.startsWith(p));
  }

  it('toute clé de SERVER_ENV_KEYS (next.config.ts) est dans la whitelist', () => {
    // Sinon : var posée dans la console Amplify, absente de .env.production,
    // donc `undefined` au RUNTIME — panne silencieuse, mode documenté dans le
    // fichier lui-même.
    const cfg = readFileSync('next.config.ts', 'utf8');
    const bloc = cfg.match(/SERVER_ENV_KEYS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
    const cles = [...bloc.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect(cles.length).toBeGreaterThan(5); // garde-fou : le parsing a marché

    const manquantes = cles.filter((k) => !couverte(k));
    expect(manquantes, `clés inlinées par next.config mais absentes de la whitelist amplify.yml : ${manquantes.join(', ')}`).toEqual([]);
  });

  it('les flags de garde-fous métier sont couverts (régression #P0-4)', () => {
    // Ces flags pilotent la validation serveur des fichiers et la signature des
    // devis de livraison. Absents de la whitelist, les poser dans la console
    // Amplify n'avait AUCUN effet — les garde-fous restaient OFF en silence.
    for (const k of [
      'ENFORCE_SHIPPING_SIG',
      'FILE_REVALIDATION',
      'ORDER_CANCEL_FEE_CENTS',
      'REFERRAL_REWARD_CENTS',
      'GOLD_FREE_SHIPPING_CAP_CENTS',
      'DIRECT_URL',
      // Plancher de marge (#462) : absent de la whitelist, la var n'atteint
      // JAMAIS le runtime → le catalogue refuse de coter en production alors
      // que l'opérateur croit l'avoir configurée dans la console Amplify.
      'DEFAULT_MARGIN_PCT',
    ]) {
      expect(couverte(k), `${k} n'est pas capturée par la whitelist amplify.yml`).toBe(true);
    }
  });
});

describe('amplify.yml — soupape SKIP_MIGRATIONS', () => {
  const yml = readFileSync('amplify.yml', 'utf8');

  /** Rejoue la condition RÉELLE extraite d'amplify.yml pour une valeur donnée. */
  function saute(valeur: string | undefined): boolean {
    const cond = yml.match(/if \[ "\$\{SKIP_MIGRATIONS:-\}" = "([^"]+)" \]/)?.[1];
    if (cond === undefined) throw new Error('soupape introuvable dans amplify.yml — le pipeline a changé');
    const dir = mkdtempSync(join(tmpdir(), 'plio-skip-'));
    const f = join(dir, 'test.sh');
    writeFileSync(f, `if [ "\${SKIP_MIGRATIONS:-}" = "${cond}" ]; then echo SAUTE; else echo APPLIQUE; fi`);
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (valeur === undefined) delete env.SKIP_MIGRATIONS;
    else env.SKIP_MIGRATIONS = valeur;
    return execFileSync('bash', [f], { encoding: 'utf8', env }).trim() === 'SAUTE';
  }

  it("n'est PAS empruntable par un déploiement normal", () => {
    // La propriété qui compte : le couplage migrations↔build protège contre le
    // déploiement de code attendant un schéma inexistant. La soupape doit exiger
    // un geste délibéré, jamais s'activer par défaut.
    expect(saute(undefined)).toBe(false);
    expect(saute('')).toBe(false);
  });

  it('exige la valeur EXACTE « 1 » — toute valeur ambiguë applique les migrations', () => {
    // Fail-safe : dans le doute, on migre. Accepter `true`/`yes`/`on` inviterait
    // à sauter les migrations en croyant activer autre chose, et le schéma
    // dériverait en silence — pire que la panne qu'on contourne.
    expect(saute('1')).toBe(true);
    for (const v of ['true', 'yes', 'on', 'TRUE', '0', 'oui']) {
      expect(saute(v), `« ${v} » ne doit pas activer la soupape`).toBe(false);
    }
  });

  it('SKIP_MIGRATIONS atteint bien le build (whitelist)', () => {
    // Sans ça, la poser dans la console Amplify n'aurait aucun effet — exactement
    // le mode de panne silencieuse que cette whitelist existe pour empêcher.
    const whitelist = yml.match(/grep -E '\^\(([^)]+)\)'/)?.[1] ?? '';
    expect(whitelist.split('|')).toContain('SKIP_MIGRATIONS');
  });
});
