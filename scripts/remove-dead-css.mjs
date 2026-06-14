#!/usr/bin/env node
/**
 * remove-dead-css.mjs — supprime du CSS MORT de globals.css en toute sûreté.
 *
 * « Mort » = un sélecteur 100 % composé de classes dont AUCUNE n'apparaît comme
 * token dans le code source (JSX/TS), ET dont aucune ne commence par un « stem
 * dynamique » (préfixe `foo-` utilisé en template literal `…foo-${x}…`). Une
 * telle règle ne matche AUCUN élément rendu → la retirer ne change rien au rendu
 * (preuve par construction). Le garde stem couvre les classes construites à la
 * volée. Conservateur : on garde au moindre doute.
 *
 * Sécurités :
 *  - On ne retire QUE des règles dont le sélecteur est purement classes/pseudos
 *    (pas d'élément nu, pas d'#id, pas de `*`, pas d'attribut) → zéro risque de
 *    matcher un élément vivant par un autre biais.
 *  - On préserve commentaires, @media (wrapper gardé), @keyframes, formatage.
 *  - Dry-run par défaut. `--apply` écrit. `--only <substr>` = pilote (ne retire
 *    que les règles dont le sélecteur contient <substr>).
 *
 * Usage :
 *   node scripts/remove-dead-css.mjs                 # rapport (dry-run)
 *   node scripts/remove-dead-css.mjs --only adm-cache --apply
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();
const GLOBALS = join(ROOT, 'src/styles/globals.css');

// ─── 1) Tokens + stems dynamiques du code source ─────────────────────────────
const usedTokens = new Set();
const dynStems = new Set();
function walk(dir) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === '.git') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(tsx|ts|jsx|js|html|mdx)$/.test(e) || /\.css/.test(e)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.match(/[a-zA-Z][\w-]*/g) ?? []) usedTokens.add(m);
    // Stems dynamiques : un `foo-bar-` juste avant `${` dans un template literal.
    for (const m of src.matchAll(/([a-zA-Z][\w-]*-)\$\{/g)) dynStems.add(m[1]);
  }
}
walk(join(ROOT, 'src'));

const isDeadClass = (c) =>
  !usedTokens.has(c) && ![...dynStems].some((s) => c.startsWith(s));

// ─── 2) Scanner CSS (commentaire-aware, profondeur @media) ───────────────────
// Retourne une liste plate de noeuds {kind, prelude, start, end} où start..end
// délimite le texte complet du noeud. Les rules dans @media sont aplaties avec
// leur span propre ; le wrapper @media est gardé.
function scan(css) {
  const nodes = [];
  let i = 0;
  const n = css.length;
  let segStart = 0;       // début du prelude courant
  const mediaStack = [];

  while (i < n) {
    // commentaire
    if (css[i] === '/' && css[i + 1] === '*') {
      const j = css.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (css[i] === '{') {
      const prelude = css.slice(segStart, i).trim();
      if (prelude.startsWith('@media')) {
        mediaStack.push(true);
        i++; segStart = i; continue;
      }
      if (prelude.startsWith('@')) {
        // @keyframes/@font-face/@supports : saute le bloc équilibré (opaque).
        let depth = 1; i++;
        while (i < n && depth > 0) {
          if (css[i] === '/' && css[i + 1] === '*') { const j = css.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
          if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++;
        }
        segStart = i; continue;
      }
      // règle normale : corps jusqu'au } (pas de nesting natif)
      let depth = 1; i++;
      while (i < n && depth > 0) {
        if (css[i] === '/' && css[i + 1] === '*') { const j = css.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
        if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++;
      }
      // start = segStart (juste après le `}`/`{` précédent) — surtout PAS remonté
      // au début de ligne : sur un `@media (...) { .x {…} }` en une ligne, ça
      // avalerait l'ouverture `@media {` sans sa fermeture → accolade orpheline.
      // Ici on retire ` .x {…}` et on laisse `@media (...) {}` vide mais ÉQUILIBRÉ.
      nodes.push({ kind: 'rule', prelude, start: segStart, end: i });
      segStart = i; continue;
    }
    if (css[i] === '}') { if (mediaStack.length) mediaStack.pop(); i++; segStart = i; continue; }
    i++;
  }
  return nodes;
}

// Sélecteur purement classes/pseudos (pas d'élément/#id/*/attr) ?
function isPureClassSelector(sel) {
  // éclate les sélecteurs groupés ; chaque sous-sélecteur doit être pure-classe
  return sel.split(',').every((part) => {
    const p = part.trim();
    if (!p) return false;
    // retire combinateurs/espaces → tokens
    const tokens = p.split(/[\s>+~]+/).filter(Boolean);
    return tokens.every((t) => {
      // chaque token : suite de .class et :pseudo, rien d'autre
      const stripped = t.replace(/\.[\w-]+/g, '').replace(/::?[\w-]+(\([^)]*\))?/g, '');
      return stripped === '' && /\./.test(t);
    });
  });
}

function selectorClasses(sel) {
  return [...new Set((sel.match(/\.([\w-]+)/g) ?? []).map((c) => c.slice(1)))];
}

// ─── 3) Décide quelles règles retirer ────────────────────────────────────────
const css = readFileSync(GLOBALS, 'utf8');
const nodes = scan(css);
const toRemove = [];
for (const node of nodes) {
  if (node.kind !== 'rule') continue;
  const sel = node.prelude;
  if (!isPureClassSelector(sel)) continue;
  const classes = selectorClasses(sel);
  if (classes.length === 0) continue;
  if (!classes.every(isDeadClass)) continue;
  if (ONLY && !sel.includes(ONLY)) continue;
  toRemove.push(node);
}

// ─── 4) Rapport / application ────────────────────────────────────────────────
const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const removedClasses = new Set();
let removedLines = 0;
for (const r of toRemove) {
  for (const c of selectorClasses(r.prelude)) removedClasses.add(c);
  removedLines += css.slice(r.start, r.end).split('\n').length;
}
console.log(`\n${C.bold}🧹 remove-dead-css${C.reset} ${C.dim}${ONLY ? `(pilote --only « ${ONLY} »)` : '(tout le mort)'}${C.reset}`);
console.log(`${C.dim}stems dynamiques gardés: ${[...dynStems].join(', ') || '(aucun)'}${C.reset}`);
console.log(`règles mortes retirables : ${C.bold}${toRemove.length}${C.reset}  (~${removedLines} lignes, ${removedClasses.size} classes)\n`);
if (toRemove.length && !APPLY) {
  console.log(`${C.dim}échantillon (15 premiers sélecteurs) :${C.reset}`);
  for (const r of toRemove.slice(0, 15)) console.log(`  ${C.red}- ${r.prelude.replace(/\s+/g, ' ').slice(0, 90)}${C.reset}`);
  console.log(`\n${C.yellow}Dry-run. Ajoute --apply pour écrire.${C.reset}\n`);
}

if (APPLY && toRemove.length) {
  // Reconstruit en sautant les spans retirés, puis collapse les lignes vides ≥3.
  const remove = toRemove.slice().sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const r of remove) {
    out += css.slice(cursor, r.start);
    cursor = r.end;
  }
  out += css.slice(cursor);
  // Strip des `@media (...) {}` devenus VIDES (toutes leurs règles retirées) —
  // transformation sûre (un media vide ne style rien). Plusieurs passes pour les
  // @media imbriqués. `[^{}]*` garantit qu'on ne matche que des media simples,
  // `\{\s*\}` qu'ils sont bien vides → jamais un media avec des règles.
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(/^[ \t]*@media[^{}]*\{\s*\}[ \t]*\n?/gm, '');
    if (next === out) break;
    out = next;
  }
  // PAS de collapse global : diff CHIRURGICAL. start=segStart inclut déjà l'espace
  // de tête de chaque règle, donc pas de ligne vide orpheline.
  writeFileSync(GLOBALS, out, 'utf8');
  console.log(`${C.green}✓ Écrit : ${toRemove.length} règles retirées de globals.css.${C.reset}\n`);
}

process.exit(0);
