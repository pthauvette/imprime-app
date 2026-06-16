#!/usr/bin/env node
/**
 * Diagnostic « la prod est-elle à jour ? » en une commande.
 *
 * Né d'un incident (2026-06) : tout le travail MCP + clés API était mergé sur main
 * et vert en CI, mais la prod servait un build antérieur — la route /api/mcp/mcp
 * répondait 404. Cause probable : `prisma migrate deploy` (amplify.yml) échoue
 * contre la vraie DB prod → build rouge → prod gelée. La CI ne l'attrape pas (elle
 * build avec une DATABASE_URL stub, sans toucher de vraie DB).
 *
 * Ce script :
 *   1. Ping des routes prod « marqueurs d'époque » → app live ? MCP déployé ?
 *   2. (si DATABASE_URL fournie) `prisma migrate status` → migrations pending/failed.
 *   3. Verdict clair + prochaine action.
 *
 * Usage :
 *   node scripts/check-deploy.mjs                         # ping prod seulement
 *   node scripts/check-deploy.mjs --url https://www.plio.ca
 *   DATABASE_URL='postgresql://...PROD...' node scripts/check-deploy.mjs   # + migrate status
 *
 * ⚠️ Passe la DATABASE_URL de PROD explicitement. Le .env local pointe sur une
 * branche Neon dev périmée — ne PAS s'y fier pour ce check.
 */
import { execFileSync } from 'node:child_process';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const BASE = (arg('url', 'https://www.plio.ca')).replace(/\/+$/, '');
const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m' };
const ok = (s) => `${C.green}${s}${C.reset}`;
const bad = (s) => `${C.red}${s}${C.reset}`;
const warn = (s) => `${C.yellow}${s}${C.reset}`;

/** Probe une route. Pour le MCP on POST un tools/list ; sinon GET. */
async function probe({ path, method = 'GET', body, accept }) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(accept ? { Accept: accept } : {}),
      },
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    return res.status;
  } catch (err) {
    return `ERR(${err.name})`;
  }
}

/** prisma migrate status — execFile (PAS de shell, commande 100 % statique → zéro injection). */
function migrateStatus() {
  try {
    const out = execFileSync('npx', ['prisma', 'migrate', 'status'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { out, upToDate: /up to date/i.test(out), pending: /not yet been applied/i.test(out), failed: /failed/i.test(out) || /migrate resolve/i.test(out) };
  } catch (err) {
    // exit code ≠ 0 quand pending/failed — la sortie est dans stdout/stderr.
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    return { out, upToDate: false, pending: /not yet been applied/i.test(out), failed: /failed/i.test(out) || /migrate resolve/i.test(out) };
  }
}

/** SHA de origin/main (fallback si --expect-sha non fourni). '' si git indispo. */
function gitMainSha() {
  try {
    return execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** releaseId (= SHA déployé, 7 hex) exposé par /api/health. null si injoignable. */
async function fetchReleaseId() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15000) });
    const j = await res.json();
    return typeof j?.releaseId === 'string' ? j.releaseId : null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n${C.bold}🔎 check-deploy${C.reset} ${C.dim}→ ${BASE}${C.reset}\n`);

  // 0) SHA déployé vs SHA attendu — la vraie mesure « merged ≠ deployed ».
  //    --expect-sha <sha> en CI (le commit mergé) ; sinon défaut = origin/main HEAD.
  // Validation hex stricte : un --expect-sha mal formé (flag avalé, 'dev', vide…)
  // → expectSha='' → on NE compare PAS (pas de faux drift), au lieu de comparer
  // contre du garbage et d'exit 1 à tort.
  const rawExpect = (arg('expect-sha', '') || gitMainSha()).slice(0, 7).toLowerCase();
  const expectSha = /^[0-9a-f]{7}$/.test(rawExpect) ? rawExpect : '';
  const deployedSha = (await fetchReleaseId())?.toLowerCase() ?? null;
  let drift = false;
  if (deployedSha === null) {
    console.log(`  SHA déployé        ${warn('injoignable')}   ${C.dim}GET /api/health${C.reset}`);
  } else if (deployedSha === 'dev') {
    console.log(`  SHA déployé        ${warn("'dev'")}   ${C.dim}AWS_COMMIT_ID non câblé au runtime (amplify.yml whitelist)${C.reset}`);
  } else if (expectSha) {
    drift = deployedSha !== expectSha;
    console.log(`  SHA déployé        ${drift ? bad(`${deployedSha} ≠ attendu ${expectSha} (DRIFT)`) : ok(`${deployedSha} (à jour)`)}`);
  } else {
    console.log(`  SHA déployé        ${ok(deployedSha)}   ${C.dim}(aucun SHA attendu — passe --expect-sha ou aie origin/main)${C.reset}`);
  }

  // 1) Probes « marqueurs d'époque ».
  const health = await probe({ path: '/api/health' });
  const mcp = await probe({
    path: '/api/mcp/mcp',
    method: 'POST',
    accept: 'application/json, text/event-stream',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  const apiKeys = await probe({ path: '/api/account/api-keys' }); // #346
  const cleanup = await probe({ path: '/api/cron/cleanup' }); // route ancienne (existe → 401)

  const live = health === 200;
  // 200 = tools/list répond en anonyme (MCP_OAUTH off). 401 = route déployée mais
  // OAuth requise (MCP_OAUTH=enforce) → le challenge répond = serveur LIVE aussi.
  // 404 = route absente = pas déployé.
  const mcpLive = mcp === 200 || mcp === 401;
  const mcpOAuthGated = mcp === 401;
  const apiKeysDeployed = apiKeys === 401 || apiKeys === 405 || apiKeys === 200;
  const interpret = (code, deployedCodes) =>
    typeof code === 'string' ? warn(code) : deployedCodes.includes(code) ? ok(`${code} (présent)`) : bad(`${code} (absent)`);

  console.log(`  app live           ${live ? ok('oui') : bad('NON')}        ${C.dim}GET /api/health → ${health}${C.reset}`);
  console.log(`  route ancienne     ${interpret(cleanup, [401, 405, 200])}   ${C.dim}/api/cron/cleanup${C.reset}`);
  console.log(`  clés API (#346)    ${interpret(apiKeys, [401, 405, 200])}   ${C.dim}/api/account/api-keys${C.reset}`);
  const mcpLabel = mcpOAuthGated ? '401 (LIVE + OAuth requise ✅)' : '200 (LIVE ✅)';
  console.log(`  MCP (#340+)        ${mcpLive ? ok(mcpLabel) : interpret(mcp, [200, 401])}   ${C.dim}POST /api/mcp/mcp${C.reset}`);

  // 2) Migrations (optionnel — exige DATABASE_URL prod).
  let mig = null;
  if (process.env.DATABASE_URL) {
    console.log(`\n${C.dim}prisma migrate status (DATABASE_URL fournie)…${C.reset}`);
    mig = migrateStatus();
    if (mig.failed) {
      console.log(`  migrations         ${bad('UNE MIGRATION A ÉCHOUÉ')} → bloque tous les migrate deploy`);
      const m = mig.out.match(/(\d{14}_[a-z0-9_]+)/i);
      if (m) console.log(`  ${C.dim}suspecte : ${m[1]} → npx prisma migrate resolve --rolled-back ${m[1]}${C.reset}`);
    } else if (mig.pending) {
      console.log(`  migrations         ${warn('des migrations EN ATTENTE')} (migrate deploy ne tourne pas en prod)`);
    } else if (mig.upToDate) {
      console.log(`  migrations         ${ok('à jour')}`);
    }
  } else {
    console.log(`\n  ${C.dim}migrations : ignoré (passe DATABASE_URL=<prod> pour vérifier prisma migrate status)${C.reset}`);
  }

  // 3) Verdict.
  console.log(`\n${C.bold}Verdict${C.reset}`);
  if (drift) {
    console.log(`  ${bad('🔴 DRIFT : merged ≠ deployed.')} La prod sert ${deployedSha}, attendu ${expectSha}.`);
    console.log(`     Le build Amplify du commit attendu n'a pas (encore) atterri → Console Amplify → Build history (rouge ? en cours ? branche = main ?).`);
  }
  if (mcpLive) {
    const suffix = mcpOAuthGated ? ` ${C.dim}(OAuth requise — 401 anonyme attendu)${C.reset}` : '';
    console.log(`  ${ok('✅ Le MCP est LIVE en prod.')} Endpoint : ${BASE}/api/mcp/mcp${suffix}`);
  } else if (live && !apiKeysDeployed) {
    console.log(`  ${bad('🔴 Prod EN RETARD')} : l'app tourne mais le travail récent (clés API #346, MCP #340+) n'est PAS déployé.`);
    if (mig?.failed) {
      console.log(`     Cause confirmée : migration échouée → migrate resolve puis relance le build Amplify.`);
    } else if (mig?.pending) {
      console.log(`     Migrations en attente → le build Amplify (migrate deploy) ne s'exécute pas/échoue. Vérifie Build history.`);
    } else {
      console.log(`     Vérifie : (a) Console Amplify → Build history (builds rouges ? branche = main ?) ;`);
      console.log(`               (b) DATABASE_URL=<prod> node scripts/check-deploy.mjs (pour voir migrate status).`);
    }
  } else if (!live) {
    console.log(`  ${bad('🔴 App injoignable')} (/api/health ≠ 200). Vérifie le domaine / l'état du service.`);
  } else {
    console.log(`  ${warn('🟡 État mixte')} — relis les lignes ci-dessus.`);
  }
  console.log('');

  // Exit 1 SEULEMENT sur un vrai drift SHA (merged ≠ deployed) → utilisable
  // comme gate dans la sonde CI. Les états « MCP pas encore live » / « mixte »
  // restent informatifs (exit 0) : sans --expect-sha fiable, on n'échoue pas.
  process.exit(drift ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
