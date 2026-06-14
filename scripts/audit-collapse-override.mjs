#!/usr/bin/env node
/**
 * audit-collapse-override.mjs — détecteur statique du bug-classe « overflow mobile ».
 *
 * Pattern (cause racine des overflows #375-377) : une classe de layout a un
 * collapse mobile `@media (max-width: …) { .X { grid-template-columns: 1fr } }`
 * mais une redéfinition POSTÉRIEURE (ordre source / fichier importé après) la
 * réécrit en multi-colonnes (`560px 1fr`, `1fr 1fr`, …) à spécificité égale →
 * le collapse est battu → la grille ne s'effondre jamais à 375px → overflow.
 *
 * Ce script RÉSOUT le gagnant de cascade de `grid-template-columns` à 375px pour
 * chaque classe simple (`.X`, `.X.X`…), à travers globals.css PUIS
 * migrated-pages.css (ordre de chargement de layout.tsx), en respectant
 * spécificité puis ordre source. Si le gagnant est multi-colonnes → FLAG.
 *
 * Lecture seule. `node scripts/audit-collapse-override.mjs [--all]`
 * Exit 1 si au moins un bug est trouvé (utilisable en garde de non-régression).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOW_ALL = process.argv.includes('--all');
const TARGET_WIDTH = 375;

// ─── Parseur (repris de css-dedup-analysis.mjs : @media + ordre source) ──────
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseRules(css, file) {
  css = stripComments(css);
  const rules = [];
  const mediaStack = [];
  let i = 0;
  const n = css.length;
  let buf = '';
  let order = 0;

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
        let depth = 1; i++;
        while (i < n && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
        continue;
      }
      let depth = 1; i++; let body = '';
      while (i < n && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') { depth--; if (depth === 0) break; }
        body += css[i]; i++;
      }
      i++;
      const media = [...mediaStack];
      for (const sel of prelude.split(',').map((s) => s.trim()).filter(Boolean)) {
        rules.push({ file, order: order++, media, selector: sel.replace(/\s+/g, ' '), body });
      }
      continue;
    }
    if (ch === '}') {
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

// ─── Le @media s'applique-t-il à TARGET_WIDTH px ? ───────────────────────────
function mediaAppliesAtWidth(mediaArr, width) {
  for (const m of mediaArr) {
    for (const mm of m.match(/max-width:\s*(\d+)px/g) ?? []) {
      if (width > Number(mm.match(/(\d+)/)[1])) return false;
    }
    for (const mm of m.match(/min-width:\s*(\d+)px/g) ?? []) {
      if (width < Number(mm.match(/(\d+)/)[1])) return false;
    }
  }
  return true;
}

// ─── Spécificité (id, class, type) — suffit pour `.X` vs `.X.X` vs `.p .X` ────
function specificity(sel) {
  const ids = (sel.match(/#[\w-]+/g) ?? []).length;
  const classes = (sel.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length;
  const types = (sel.replace(/[.#:[][^ >+~]*/g, ' ').match(/\b[a-zA-Z][\w-]*\b/g) ?? []).length;
  return [ids, classes, types];
}
function cmpSpec(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }

// ─── Extrait grid-template-columns d'un corps de règle ───────────────────────
function gridCols(body) {
  const m = body.match(/grid-template-columns\s*:\s*([^;}]+)/i);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

/** Le selector cible-t-il un élément AVEC SEULEMENT la classe `cls` (pas un descendant) ? */
function targetsBareClass(sel, cls) {
  // Accepte `.cls`, `.cls.cls`, `.cls:hover`… mais PAS `.parent .cls` ni `.cls .child`.
  const s = sel.trim();
  if (/[ >+~]/.test(s)) return false; // combinateur → matche un autre élément
  const classesInSel = new Set((s.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1)));
  // Doit contenir cls et AUCUNE autre classe (sinon spécificité/ciblage différent).
  return classesInSel.has(cls) && classesInSel.size === 1;
}

/** Multi-colonnes (≥2 tracks, pas un wrap auto-fit/auto-fill) — candidat large. */
function isMultiCol(value) {
  if (!value) return false;
  const v = value.toLowerCase();
  if (/auto-fit|auto-fill/.test(v)) return false;            // wrappe → safe
  if (/^(1fr|none|100%|minmax\(0,\s*1fr\)|minmax\(0px,\s*1fr\))$/.test(v)) return false;
  const tracks = v.replace(/\([^)]*\)/g, 'X').split(/\s+/).filter(Boolean);
  return tracks.length >= 2;
}

/** Somme des colonnes FIXES en px (les px sont incompressibles → mangent le viewport). */
function fixedPxSum(value) {
  let sum = 0;
  for (const m of (value ?? '').match(/(\d+)px/g) ?? []) sum += Number(m.match(/\d+/)[0]);
  return sum;
}

/**
 * Haute-confiance qu'une grille DÉBORDE à 375px — décidable statiquement SEULEMENT
 * quand des colonnes FIXES (px) somment trop pour le viewport. Les `1fr 1fr`,
 * `40px 1fr`, etc. dépendent du min-content (NON décidable → faux positifs) →
 * exclus du « bug ». Seuil 240px : laisse < 135px pour le reste à 375px.
 */
function isHighConfidenceOverflow(value) {
  return isMultiCol(value) && fixedPxSum(value) >= 240;
}

// ─── Charge globals PUIS migrated (ordre de layout.tsx) ───────────────────────
const globals = parseRules(readFileSync(join(ROOT, 'src/styles/globals.css'), 'utf8'), 'globals');
let migrated = [];
try {
  migrated = parseRules(readFileSync(join(ROOT, 'src/styles/migrated-pages.css'), 'utf8'), 'migrated');
} catch { /* migrated absent → globals seul */ }
// Ordre source global : globals (0) avant migrated (1).
const all = [...globals, ...migrated.map((r) => ({ ...r, fileRank: 1 }))].map((r, idx) => ({ ...r, fileRank: r.file === 'migrated' ? 1 : 0, globalOrder: idx }));

// Toutes les classes qui ont un grid multi-colonnes quelque part = candidats.
const candidates = new Set();
for (const r of all) {
  const g = gridCols(r.body);
  if (g && isMultiCol(g)) {
    for (const c of (r.selector.match(/\.[\w-]+/g) ?? [])) {
      if (targetsBareClass(r.selector, c.slice(1))) candidates.add(c.slice(1));
    }
  }
}

// Pour chaque candidat : gagnant de cascade de grid-template-columns à 375px,
// classé par CONFIANCE (statiquement on ne tranche l'overflow que sur les px fixes).
const highConf = [];   // grosses colonnes fixes ≥240px → déborde à coup sûr
const defeated = [];   // un collapse @media existe mais est BATTU (le vrai pattern)
const lowConf = [];    // multi-col mais content-dépendant (1fr 1fr, 40px 1fr…) → À MESURER
const okList = [];
for (const cls of [...candidates].sort()) {
  const applying = all.filter(
    (r) => targetsBareClass(r.selector, cls) && gridCols(r.body) && mediaAppliesAtWidth(r.media, TARGET_WIDTH),
  );
  if (applying.length === 0) continue;
  let winner = applying[0];
  for (const r of applying) {
    const c = cmpSpec(specificity(r.selector), specificity(winner.selector));
    if (c > 0 || (c === 0 && r.globalOrder > winner.globalOrder)) winner = r;
  }
  const value = gridCols(winner.body);
  const hadCollapse = applying.some((r) => r.media.length && !isMultiCol(gridCols(r.body)));
  const entry = { cls, value, winner, hadCollapse, fixedPx: fixedPxSum(value), count: applying.length };
  if (!isMultiCol(value)) { okList.push(entry); continue; }   // collapse gagne → sain
  if (isHighConfidenceOverflow(value)) highConf.push(entry);
  else if (hadCollapse) defeated.push(entry);
  else lowConf.push(entry);
}

// ─── Rapport ──────────────────────────────────────────────────────────────
const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', reset: '\x1b[0m' };
const line = (e) => {
  const ctx = e.winner.media.length ? e.winner.media.join(' >> ') : '(non gardé)';
  return `  .${e.cls}  →  ${C.bold}${e.value}${C.reset}  ${C.dim}[${e.winner.file}, ${ctx}, fixe=${e.fixedPx}px]${C.reset}`;
};
console.log(`\n${C.bold}🔎 audit-collapse-override${C.reset} ${C.dim}— gagnant grid à ${TARGET_WIDTH}px${C.reset}`);
console.log(`${C.dim}candidats multi-col: ${candidates.size} | sains (collapse OK): ${okList.length}${C.reset}`);
console.log(`${C.dim}→ haute-confiance: ${highConf.length} | collapse battu: ${defeated.length} | faible-confiance (à MESURER): ${lowConf.length}${C.reset}\n`);

if (highConf.length) {
  console.log(`${C.red}${C.bold}■ HAUTE-CONFIANCE — colonnes fixes ≥240px, déborde à coup sûr (${highConf.length})${C.reset}`);
  for (const e of highConf) console.log(`${C.red}${line(e)}${C.reset}`);
  console.log('');
}
if (defeated.length) {
  console.log(`${C.yellow}${C.bold}■ COLLAPSE @media BATTU — pattern racine exact, content-dépendant (${defeated.length})${C.reset}`);
  for (const e of defeated) console.log(`${C.yellow}${line(e)}${C.reset}`);
  console.log('');
}
if (SHOW_ALL && lowConf.length) {
  console.log(`${C.dim}■ FAIBLE-CONFIANCE — multi-col content-dépendant, NON décidable statiquement → mesurer au runtime (${lowConf.length})${C.reset}`);
  for (const e of lowConf) console.log(`${C.dim}${line(e)}${C.reset}`);
  console.log('');
} else if (lowConf.length) {
  console.log(`${C.dim}(+${lowConf.length} faible-confiance content-dépendantes — relance avec --all ; à trancher par measure-overflow.mjs au runtime)${C.reset}\n`);
}
if (!highConf.length && !defeated.length) {
  console.log(`${C.green}✅ Aucun overflow haute-confiance ni collapse battu.${C.reset}\n`);
}

// Exit 1 seulement sur les bugs DÉCIDABLES (haute-confiance + collapse battu).
process.exit(highConf.length + defeated.length > 0 ? 1 : 0);
