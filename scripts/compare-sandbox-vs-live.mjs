#!/usr/bin/env node
/**
 * compare-sandbox-vs-live.mjs — les tarifs Sinalite LIVE diffèrent-ils du SANDBOX ?
 *
 * POURQUOI. Tout ce que Plio affiche comme prix a été calculé contre le
 * SANDBOX : la table `ProductStartingPrice` (les « à partir de » du catalogue),
 * l'index de variantes en cache, et par ricochet les devis MCP. Le jour où
 * `SINALITE_API_BASE` bascule sur `https://liveapi.sinalite.com`, ces chiffres
 * deviennent des affirmations sur un tarif qu'on n'a jamais interrogé.
 *
 * Deux issues, et une seule est acceptable sans vérification :
 *   - tarifs identiques → rien à faire, on garde le cache ;
 *   - tarifs différents → le catalogue annonce des prix FAUX sur des pages
 *     publiques indexées, et le devis MCP cote à côté. Il faut purger.
 *
 * Ce script ne purge rien. Il MESURE l'écart et le montre, produit par produit.
 *
 * ⚠️ SÉCURITÉ. Il lit `.env.local` LUI-MÊME : aucun secret ne transite par la
 * ligne de commande, et aucune valeur d'identifiant n'est jamais affichée. Il
 * n'écrit rien, ne commande rien — seulement des GET/POST de tarification.
 *
 * Usage :
 *   node scripts/compare-sandbox-vs-live.mjs
 *   node scripts/compare-sandbox-vs-live.mjs --ids 1,7,12,37,97
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SANDBOX = 'https://api.sinaliteuppy.com';
const LIVE = 'https://liveapi.sinalite.com';

function lireEnv() {
  const brut = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  const env = {};
  for (const ligne of brut.split('\n')) {
    const m = ligne.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function arg(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : defaut;
}

/**
 * Un seul jeton pour les deux bases : l'`audience` est la même
 * (`apiconnect.sinalite.com`, cf. doc du portail) et le endpoint de jeton vit
 * sur le host SANDBOX même pour la production — c'est contre-intuitif, et c'est
 * ce que dit le changelog du 2021/07/27.
 */
async function jeton(env) {
  const res = await fetch(`${env.SINALITE_AUTH_BASE ?? SANDBOX}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.SINALITE_CLIENT_ID,
      client_secret: env.SINALITE_CLIENT_SECRET,
      audience: env.SINALITE_AUDIENCE ?? 'https://apiconnect.sinalite.com',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`auth ${res.status} — identifiants ou audience invalides`);
  const { access_token } = await res.json();
  return access_token;
}

const entetes = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });

/** Combinaison d'options la moins chère : première valeur de chaque groupe, plus petite qty. */
function comboMinimale(options) {
  const parGroupe = new Map();
  for (const o of options) {
    if (!parGroupe.has(o.group)) parGroupe.set(o.group, []);
    parGroupe.get(o.group).push(o);
  }
  const ids = [];
  for (const [groupe, opts] of parGroupe) {
    if (groupe === 'qty') {
      const tri = [...opts].sort((a, b) => Number(a.name) - Number(b.name));
      ids.push(tri[0].id);
    } else {
      ids.push(opts[0].id);
    }
  }
  return ids;
}

async function prix(base, t, id, store, optionIds) {
  const res = await fetch(`${base}/price/${id}/${store}`, {
    method: 'POST',
    headers: entetes(t),
    body: JSON.stringify({ productOptions: optionIds }),
  });
  if (!res.ok) return { erreur: `HTTP ${res.status}` };
  const d = await res.json();
  const n = Number.parseFloat(d.price);
  // ⚠️ Un prix non numérique doit être une ERREUR, pas un zéro implicite.
  // Premier jet : le produit 97 renvoyait NaN des deux côtés, et
  // `Math.abs(NaN - NaN) >= 0.01` vaut `false` — il était compté « identique ».
  // Un faux vert exactement là où on cherche à prouver une égalité.
  if (!Number.isFinite(n)) return { erreur: `prix non numérique (${JSON.stringify(d.price)})` };
  return { prix: n };
}

async function main() {
  const env = lireEnv();
  const store = env.SINALITE_STORE_CODE ?? 'en_ca';
  const ids = arg('ids', '1,7,12,18,37,69,97,43,58')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean);

  console.log(`\nTarifs SANDBOX vs LIVE — store ${store}\n`);
  console.log('  Même jeton, mêmes options, seule la base d’URL change.\n');

  const t = await jeton(env);
  let differents = 0;
  let compares = 0;
  const ecarts = [];

  for (const id of ids) {
    try {
      // La combinaison vient du SANDBOX : c'est elle qui a servi à peupler nos
      // caches, donc c'est elle qu'il faut re-coter en live.
      const res = await fetch(`${SANDBOX}/product/${id}/${store}`, { headers: entetes(t) });
      if (!res.ok) {
        console.log(`  ?  produit ${String(id).padStart(5)}  options indisponibles (HTTP ${res.status})`);
        continue;
      }
      const [options] = await res.json();
      const combo = comboMinimale(options);

      const [s, l] = await Promise.all([
        prix(SANDBOX, t, id, store, combo),
        prix(LIVE, t, id, store, combo),
      ]);

      if (s.erreur || l.erreur) {
        console.log(`  ?  produit ${String(id).padStart(5)}  sandbox=${s.erreur ?? s.prix} live=${l.erreur ?? l.prix}`);
        continue;
      }

      compares++;
      const delta = l.prix - s.prix;
      const pct = s.prix === 0 ? 0 : (delta / s.prix) * 100;
      if (Math.abs(delta) >= 0.01) {
        differents++;
        ecarts.push({ id, s: s.prix, l: l.prix, pct });
        console.log(
          `  ✗  produit ${String(id).padStart(5)}  sandbox ${s.prix.toFixed(2)} $  →  live ${l.prix.toFixed(2)} $  (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`,
        );
      } else {
        console.log(`  ✓  produit ${String(id).padStart(5)}  ${s.prix.toFixed(2)} $  identique`);
      }
    } catch (err) {
      console.log(`  ?  produit ${String(id).padStart(5)}  ${err.message.split('\n')[0]}`);
    }
  }

  console.log('');
  if (compares === 0) {
    console.error('Aucun produit comparé — la base LIVE répond-elle avec ces identifiants ?');
    process.exit(2);
  }
  if (differents === 0) {
    console.log(`${compares} produit(s) comparé(s), AUCUN écart. Les caches peuplés en sandbox restent valables. ✓`);
    process.exit(0);
  }
  const moyen = ecarts.reduce((a, e) => a + e.pct, 0) / ecarts.length;
  console.error(
    `${differents}/${compares} produit(s) à un tarif DIFFÉRENT en live (écart moyen ${moyen >= 0 ? '+' : ''}${moyen.toFixed(1)} %).\n` +
      `→ ProductStartingPrice et l'index de variantes annoncent des prix faux. Purge + recalcul requis AVANT la bascule.`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error('compare-sandbox-vs-live a échoué :', err.message);
  process.exit(2);
});
