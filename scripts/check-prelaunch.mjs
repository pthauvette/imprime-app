#!/usr/bin/env node
/**
 * Vérification PRÉ-LANCEMENT — ce qui est observable depuis l'extérieur.
 *
 *   node scripts/check-prelaunch.mjs
 *   node scripts/check-prelaunch.mjs --url https://www.plio.ca
 *
 * POURQUOI CE SCRIPT
 * ------------------
 * L'audit pré-lancement 2026-07 a conclu que le code était sain mais que le
 * lancement restait bloqué par des RÉGLAGES DE CONSOLE. Or un réglage de console
 * ne se vérifie pas en lisant le dépôt : il faut interroger la prod.
 *
 * PRINCIPE : ne rapporter que ce qui est RÉELLEMENT observé. La leçon qui a
 * traversé tout l'audit est qu'un test incapable d'échouer ne prouve rien —
 * plusieurs faux « verts » ont coûté des heures (un 200 sur une page qui
 * n'appelait pas le code concerné ; une commande qui s'imprime et qu'on prend
 * pour la preuve d'une bascule). D'où la section « NON VÉRIFIABLE D'ICI »,
 * aussi importante que les contrôles eux-mêmes : elle empêche de lire un
 * rapport tout vert comme un feu vert.
 */

const args = process.argv.slice(2);
const BASE = (args[args.indexOf('--url') + 1] ?? '').startsWith('http')
  ? args[args.indexOf('--url') + 1]
  : 'https://www.plio.ca';

const OK = '\x1b[32m✅\x1b[0m';
const KO = '\x1b[31m🔴\x1b[0m';
const WARN = '\x1b[33m🟡\x1b[0m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

let bloquants = 0;
let avertissements = 0;

function ok(msg, detail) { console.log(`${OK} ${msg}${detail ? `\n   ${DIM}${detail}${RST}` : ''}`); }
function ko(msg, detail) { bloquants++; console.log(`${KO} ${msg}${detail ? `\n   ${DIM}${detail}${RST}` : ''}`); }
function warn(msg, detail) { avertissements++; console.log(`${WARN} ${msg}${detail ? `\n   ${DIM}${detail}${RST}` : ''}`); }

async function fetchJson(url, timeoutMs = 15000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  const texte = await res.text();
  try { return { res, json: JSON.parse(texte), texte }; }
  catch { return { res, json: null, texte }; }
}

console.log(`\nVérification pré-lancement — ${BASE}\n${'═'.repeat(60)}\n`);

// ── 1. Santé + configuration au runtime ───────────────────────────────────
console.log('── Santé & configuration');
let sante = null;
try {
  const { res, json } = await fetchJson(`${BASE}/api/health`);
  sante = json;
  if (!json) {
    ko('/api/health ne renvoie pas de JSON', `HTTP ${res.status}`);
  } else {
    const critique = json.status === 'fail';
    (critique ? ko : json.status === 'warn' ? warn : ok)(
      `/api/health → ${json.status}`,
      `release ${json.releaseId} · ${json.totalLatencyMs} ms`,
    );

    const env = json.checks?.['config:env']?.detail;
    if (!env) {
      warn('config:env absent', 'déploiement antérieur à la PR #468 ?');
    } else if (env.missingRequired > 0) {
      // La panne de juillet : posée en console, jamais transmise au runtime.
      ko(`${env.missingRequired} variable(s) REQUISE(s) absente(s) du runtime`,
         'noms dans CloudWatch (log « config:env ») — jamais dans la réponse publique');
    } else {
      ok('Toutes les variables requises atteignent le runtime');
    }
    if (env?.guardsInactive > 0) {
      warn(`${env.guardsInactive} garde-fou(s) inactif(s)`,
           'peut être délibéré (rollout off→log→enforce) — vérifier les noms dans CloudWatch');
    }

    for (const [nom, c] of Object.entries(json.checks ?? {})) {
      if (nom === 'config:env') continue;
      if (c.status === 'fail') warn(`dépendance « ${nom} » en échec`, c.error ?? '');
    }
  }
} catch (err) {
  ko('/api/health injoignable', err.message);
}

// ── 2. Mode Stripe, lu dans le bundle CLIENT ──────────────────────────────
// La clé publiable est inlinée dans le JS servi au navigateur : c'est le SEUL
// réglage Stripe réellement observable de l'extérieur. Et il suffit — Stripe
// impose que publiable et secrète soient du même mode, donc `pk_test_` en
// production implique `sk_test_`, donc aucun encaissement réel.
console.log('\n── Paiement');
try {
  // La clé n'est pas dans le HTML : Next l'inline dans le CHUNK JS de la page.
  // Chercher dans le HTML seul renvoyait « indéterminé » — un demi-résultat, donc
  // inutile. On suit les chunks jusqu'à trancher.
  const { texte: html } = await fetchJson(`${BASE}/order/review`);
  const chunks = [...new Set((html.match(/\/_next\/static\/chunks\/[A-Za-z0-9_./-]+\.js/g) ?? []))];
  let mode = null;
  for (const c of chunks) {
    const r = await fetch(`${BASE}${c}`, { signal: AbortSignal.timeout(15000) });
    const js = await r.text();
    if (/pk_live_/.test(js)) { mode = 'live'; break; }
    if (/pk_test_/.test(js)) { mode = 'test'; break; }
  }
  if (mode === 'live') {
    ok('Stripe en mode LIVE', `clé publiable pk_live_ trouvée (${chunks.length} chunks balayés)`);
  } else if (mode === 'test') {
    // Volontairement pas un bloquant : en phase d'essai, `test` est le mode
    // VOULU. C'est l'incohérence avec Sinalite qui est dangereuse, pas le mode
    // lui-même — et cette incohérence n'est pas observable d'ici.
    warn('Stripe en mode TEST', 'aucun paiement réel — cohérent SI Sinalite est en sandbox');
  } else {
    warn('Clé publiable Stripe introuvable', `${chunks.length} chunks balayés — page vide sans panier ?`);
  }

  // Vivacité du point de terminaison webhook. Un POST non signé DOIT être
  // rejeté en 400 : ça prouve que la route existe et que la vérification tourne.
  //
  // ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS : qu'il s'agit du BON `whsec_`. Un
  // secret du mauvais mode produit exactement le même `400 Invalid signature`.
  // Aucun test externe ne peut les distinguer — seul Stripe → Webhooks →
  // « Recent deliveries » tranche (200 = bon secret, 400 = mauvais, aucune
  // livraison = l'endpoint n'existe pas dans ce mode).
  try {
    const r = await fetch(`${BASE}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 400) {
      ok('Webhook Stripe joignable et vérifiant les signatures',
         'ne dit RIEN du mode du whsec_ — à lire dans « Recent deliveries »');
    } else {
      ko(`Webhook Stripe répond ${r.status} au lieu de 400`,
         'un POST non signé doit être rejeté — route absente ou vérification contournée');
    }
  } catch (err) {
    ko('Webhook Stripe injoignable', err.message);
  }

  if (mode) {
    const attendu = mode === 'live' ? 'sk_live_ / whsec_ de l’endpoint LIVE' : 'sk_test_ / whsec_ de l’endpoint TEST';
    console.log(`   ${DIM}Triplet à accorder : pk_${mode}_ ✓ · ${attendu} (non vérifiables d'ici)${RST}`);
    console.log(`   ${DIM}Chaque mode a SES PROPRES endpoints webhook — celui de l'autre mode n'existe pas.${RST}`);
  }
} catch (err) {
  warn('Mode Stripe non déterminable', err.message);
}

// ── 3. Stockage des fichiers ──────────────────────────────────────────────
console.log('\n── Stockage');
const BUCKET = process.env.S3_BUCKET ?? 'plio-uploads-prod';
const REGION = process.env.S3_REGION ?? 'ca-central-1';
try {
  const res = await fetch(`https://${BUCKET}.s3.${REGION}.amazonaws.com/`, {
    signal: AbortSignal.timeout(10000),
  });
  const corps = await res.text();
  if (res.ok && corps.includes('<ListBucketResult')) {
    // Énumérable = le modèle entier s'effondre : la sécurité repose sur
    // l'imprévisibilité des clés (cf. src/lib/storage/s3.ts).
    ko('Bucket S3 ÉNUMÉRABLE', 'toutes les clés d’artwork sont listables publiquement');
  } else {
    ok('Bucket S3 non énumérable',
       'les objets restent public-read individuellement — la barrière est l’UUID, et rien ne permet de la contourner');
  }
} catch (err) {
  warn('Bucket S3 non testable', err.message);
}

// ── 4. Dérive de déploiement ──────────────────────────────────────────────
console.log('\n── Déploiement');
if (sante?.releaseId) {
  // execFileSync (pas execSync) : aucun shell, donc rien à interpoler ni à
  // échapper. La commande est fixe ici, mais la forme sans shell est la bonne
  // habitude — c'est l'interpolation dans un shell qui crée les injections.
  const { execFileSync } = await import('node:child_process');
  try {
    const local = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim().slice(0, 7);
    if (local === sante.releaseId) ok(`Prod à jour avec origin/main (${local})`);
    else warn(`Dérive : prod=${sante.releaseId}, origin/main=${local}`,
              'un merge n’est pas encore déployé, ou le build a échoué');
  } catch {
    warn('Comparaison au dépôt impossible', 'hors dépôt git ?');
  }
}

// ── Ce que ce script NE PEUT PAS vérifier ─────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log('\n\x1b[1mNON VÉRIFIABLE D\'ICI — à contrôler en console\x1b[0m');
console.log(`${DIM}Ces points ne laissent aucune trace observable de l'extérieur.`);
console.log(`Un rapport tout vert ci-dessus ne vaut PAS feu vert.${RST}\n`);
console.log('  🔴 SINALITE_API_BASE / SINALITE_AUTH_BASE');
console.log(`     ${DIM}sandbox https://api.sinaliteuppy.com → live https://liveapi.sinalite.com`);
console.log(`     En sandbox : commande ENCAISSÉE mais JAMAIS IMPRIMÉE.`);
console.log(`     ⚠️ À basculer EN MÊME TEMPS que Stripe — l'inverse (Stripe test +`);
console.log(`     Sinalite live) déclenche de VRAIES impressions sur de faux paiements.`);
console.log(`     Identifiants client_id/secret probablement différents entre les deux,`);
console.log(`     et createOrder débite le portefeuille Sinalite (compte live à approvisionner).${RST}`);
console.log('  🔴 SINALITE_WEBHOOK_SECRET · STRIPE_WEBHOOK_SECRET (whsec_ de l’endpoint du MODE VISÉ)');
console.log(`     ${DIM}Un whsec_ d'endpoint test ne valide aucun événement live.${RST}`);
console.log(`     ${DIM}Procédure complète : docs/bascule-test-live.md${RST}`);
console.log('  🟡 SES hors sandbox · numéros TPS/TVQ/NEQ réels · noms des garde-fous inactifs (CloudWatch)');

// ── Verdict ───────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
if (bloquants > 0) {
  console.log(`\n${KO} ${bloquants} bloquant(s), ${avertissements} avertissement(s)\n`);
  process.exit(1);
}
console.log(`\n${OK} Aucun bloquant observable · ${avertissements} avertissement(s)`);
console.log(`${DIM}   Rappel : les points « non vérifiables d'ici » restent ouverts.${RST}\n`);
