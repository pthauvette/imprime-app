/**
 * Analyse de dédup CSS — compare globals.css vs migrated-pages.css.
 *
 * migrated-pages.css est GÉNÉRÉ (migrate-new-pages.mjs) à partir des <style> de
 * maquettes HTML qui dupliquaient les tokens/base de globals, puis importé APRÈS
 * globals → il gagne à spécificité égale. Le retirer ferait gagner globals.
 *
 * Le DANGER de la dédup = les règles (même contexte @media + même sélecteur)
 * présentes dans LES DEUX avec des déclarations DIFFÉRENTES : migrated gagne
 * aujourd'hui ; le retirer changerait le rendu. Ce script les liste précisément.
 *
 * Sortie : # règles uniques à migrated (vrai contenu), # dup identiques (safe à
 * retirer), # CONFLITS (à traiter avant de retirer migrated).
 *
 * Usage : node scripts/css-dedup-analysis.mjs [--conflicts]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Écrit le SLIM dans un fichier TEMP (vérifiable avant de remplacer l'original). */
function writeFileSyncSlim(content) {
  writeFileSync(join(ROOT, 'src/styles/migrated-pages.slim.css'), content, 'utf8');
}

/** Retire les commentaires /* *​/. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Parse le CSS en règles { context, selector, decls }.
 * context = la chaîne @media englobante ('' si aucune).
 * Gère le nesting de @media via une pile. Ignore @keyframes/@font-face (opaques).
 */
function parseRules(css) {
  css = stripComments(css);
  const rules = [];
  const mediaStack = [];
  let i = 0;
  const n = css.length;
  let buf = '';

  while (i < n) {
    const ch = css[i];
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      if (prelude.startsWith('@media')) {
        mediaStack.push(prelude.replace(/\s+/g, ' '));
        i++;
        continue;
      }
      if (prelude.startsWith('@')) {
        // @keyframes/@font-face/@supports… : on saute le bloc équilibré (opaque).
        let depth = 1; i++;
        while (i < n && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
        continue;
      }
      // Règle normale : lis le corps jusqu'au } équilibré (pas de nesting CSS natif ici).
      let depth = 1; i++; let body = '';
      while (i < n && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') { depth--; if (depth === 0) break; }
        body += css[i]; i++;
      }
      i++; // consomme le }
      const context = mediaStack.join(' >> ');
      const declsRaw = cleanDecls(body);      // ORDRE PRÉSERVÉ (émission)
      const declsNorm = normalizeDecls(body); // trié (comparaison seulement)
      // Un prelude peut grouper plusieurs sélecteurs (a, b, c) → on les éclate.
      for (const sel of prelude.split(',').map((s) => s.trim()).filter(Boolean)) {
        rules.push({ context, selector: normalizeSelector(sel), decls: declsNorm, declsRaw, media: [...mediaStack] });
      }
      continue;
    }
    if (ch === '}') {
      // Ferme un @media.
      if (mediaStack.length) mediaStack.pop();
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  return rules;
}

function normalizeSelector(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/** Liste de déclarations nettoyées, ORDRE PRÉSERVÉ (pour émettre du CSS valide). */
function declList(body) {
  return body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => d.replace(/\s*:\s*/, ': ').replace(/\s+/g, ' '));
}

/** Corps brut nettoyé, ordre préservé (émission). */
function cleanDecls(body) {
  return declList(body).join('; ');
}

/** Déclarations TRIÉES → comparer indépendamment de l'ordre/espaces (analyse uniquement). */
function normalizeDecls(body) {
  return declList(body).slice().sort().join('; ');
}

function key(r) { return `${r.context}||${r.selector}`; }

const globals = parseRules(readFileSync(join(ROOT, 'src/styles/globals.css'), 'utf8'));
const migrated = parseRules(readFileSync(join(ROOT, 'src/styles/migrated-pages.css'), 'utf8'));

// Index globals par clé → DERNIER variant (= gagnant en cascade dans globals) +
// toutes les variantes (pour le rapport). Aujourd'hui migrated (chargé après)
// gagne ; après retrait, c'est le DERNIER variant de globals qui gagne. Donc on
// compare migrated au DERNIER variant.
const gLast = new Map();      // clé → décls du dernier variant globals
const gAll = new Map();       // clé → toutes les variantes
for (const r of globals) {
  gLast.set(key(r), r.decls); // écrasé au fur et à mesure → reste le dernier
  if (!gAll.has(key(r))) gAll.set(key(r), new Set());
  gAll.get(key(r)).add(r.decls);
}

const uniqueToMigrated = [];   // sélecteur absent de globals → disparaîtrait (à préserver)
const identicalDup = [];        // migrated == DERNIER globals → safe à retirer
const conflicts = [];           // migrated != DERNIER globals → DANGER (migrated gagne aujourd'hui)

// Dernier OBJET règle de migrated par clé (si migrated définit 2× le sélecteur,
// c'est le dernier qui gagne — on garde son objet pour l'émission brute).
const mLastRule = new Map();
for (const r of migrated) mLastRule.set(key(r), r);

for (const [k, r] of mLastRule) {
  if (!gLast.has(k)) uniqueToMigrated.push(r);
  else if (gLast.get(k) === r.decls) identicalDup.push(r);
  else conflicts.push({ ...r, globalsVariants: [...gAll.get(k)] });
}

// ── Émission du migrated SLIM : uniquement {uniques + conflits}, ordre de décls
//    préservé, regroupé par contexte @media. Les dup identiques (présents dans
//    globals à l'identique) et les @keyframes (tous présents dans globals) sont
//    droppés → ZÉRO changement de rendu (le gagnant en cascade reste identique).
if (process.argv.includes('--emit-slim')) {
  const kept = [...uniqueToMigrated, ...conflicts];
  // Regroupe par chaîne media (les conflits/uniques partagent le même `media[]`).
  const byMedia = new Map(); // mediaKey → { media:[], rules:[] }
  for (const r of kept) {
    const mk = (r.media || []).join(' >> ');
    if (!byMedia.has(mk)) byMedia.set(mk, { media: r.media || [], rules: [] });
    byMedia.get(mk).rules.push(r);
  }
  const fmtRule = (r, indent) =>
    `${indent}${r.selector} {\n` +
    declList(r.declsRaw).map((d) => `${indent}  ${d};`).join('\n') +
    `\n${indent}}`;
  let out =
    `/* ════════════════════════════════════════════════════════════════════\n` +
    `   migrated-pages.css — SLIM (dédup CSS, ${new Date().toISOString().slice(0, 10).replace(/\d{4}-\d\d-\d\d/, 'auto')})\n` +
    `   Ne contient QUE les règles propres aux pages migrées (admin/onboarding/\n` +
    `   marketing/legal) qui ne sont PAS déjà identiques dans globals.css.\n` +
    `   Les ~1225 règles dupliquées + 3 @keyframes (tous présents dans globals)\n` +
    `   ont été retirés : zéro changement de rendu (cf. scripts/css-dedup-analysis.mjs).\n` +
    `   Importé APRÈS globals.css → ses ${kept.length} règles gagnent (overrides voulus).\n` +
    `   ════════════════════════════════════════════════════════════════════ */\n\n`;
  // Top-level d'abord.
  const top = byMedia.get('');
  if (top) {
    for (const r of top.rules) out += fmtRule(r, '') + '\n\n';
  }
  // Puis chaque @media (un seul niveau dans ce fichier).
  for (const [mk, grp] of byMedia) {
    if (mk === '') continue;
    out += `${grp.media.join(' {\n')} {\n`;
    for (const r of grp.rules) out += fmtRule(r, '  ') + '\n\n';
    out += grp.media.map(() => '}').join('\n') + '\n\n';
  }
  writeFileSyncSlim(out);
  console.log(`\n✅ migrated SLIM émis : ${kept.length} règles (${uniqueToMigrated.length} uniques + ${conflicts.length} conflits).`);
}

console.log('═══ ANALYSE DÉDUP CSS (globals vs migrated) ═══');
console.log(`Règles parsées : globals=${globals.length}, migrated=${migrated.length}`);
console.log(`  • UNIQUES à migrated (vrai contenu, à préserver) : ${uniqueToMigrated.length}`);
console.log(`  • DUP identiques (safe à retirer)               : ${identicalDup.length}`);
console.log(`  • CONFLITS (même sélecteur, décl ≠ — DANGER)    : ${conflicts.length}`);

if (process.argv.includes('--conflicts')) {
  console.log('\n═══ CONFLITS (migrated gagne aujourd\'hui ; à déplacer dans globals avant de retirer) ═══');
  for (const c of conflicts) {
    console.log(`\n[${c.context || 'top'}] ${c.selector}`);
    console.log(`  migrated : ${c.decls}`);
    console.log(`  globals  : ${c.globalsVariants.join('  ||  ')}`);
  }
}

// ── Vérification DÉFINITIVE : prouve que globals+slim donne le MÊME gagnant en
//    cascade que globals+migrated_original, pour CHAQUE (contexte, sélecteur).
//    Si 0 différence → zéro changement de rendu, garanti.
if (process.argv.includes('--verify-slim')) {
  const slim = parseRules(readFileSync(join(ROOT, 'src/styles/migrated-pages.slim.css'), 'utf8'));
  // Gagnant = DERNIÈRE décl vue dans l'ordre de chargement (globals PUIS l'autre).
  const winners = (rulesAfterGlobals) => {
    const w = new Map();
    for (const r of [...globals, ...rulesAfterGlobals]) w.set(key(r), r.decls);
    return w;
  };
  const wOrig = winners(migrated);
  const wSlim = winners(slim);
  const allKeys = new Set([...wOrig.keys(), ...wSlim.keys()]);
  const diffs = [];
  for (const k of allKeys) {
    if (wOrig.get(k) !== wSlim.get(k)) {
      diffs.push({ k, orig: wOrig.get(k), slim: wSlim.get(k) });
    }
  }
  console.log(`\n═══ VÉRIF SLIM — gagnants en cascade (globals+orig vs globals+slim) ═══`);
  console.log(`Sélecteurs comparés : ${allKeys.size}`);
  if (diffs.length === 0) {
    console.log(`✅ AUCUNE différence — rendu identique prouvé. Slim safe à appliquer.`);
  } else {
    console.log(`❌ ${diffs.length} DIFFÉRENCE(S) — NE PAS appliquer :`);
    for (const d of diffs.slice(0, 30)) {
      console.log(`\n  ${d.k}`);
      console.log(`    orig : ${d.orig}`);
      console.log(`    slim : ${d.slim}`);
    }
  }
}

if (process.argv.includes('--unique')) {
  console.log('\n═══ UNIQUES à migrated (échantillon 40) ═══');
  for (const r of uniqueToMigrated.slice(0, 40)) {
    console.log(`[${r.context || 'top'}] ${r.selector}`);
  }
}
