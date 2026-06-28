/**
 * Déduplication SÛRE de globals.css : retire les blocs de règle EXACTEMENT dupliqués
 * (même contexte @media + même prélude + mêmes déclarations), en gardant la DERNIÈRE
 * occurrence (celle qui gagne la cascade). Suppression chirurgicale par plage de
 * caractères → préserve commentaires/structure. Gardé par une preuve de CSS RÉSOLU
 * identique avant/après (0-diff) — sinon abort sans écrire.
 *
 * Usage : node scripts/dedup-globals-css.mjs [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = new URL('../src/styles/globals.css', import.meta.url);
const APPLY = process.argv.includes('--apply');
const css = readFileSync(FILE, 'utf8');

// ── Parser chirurgical : capture chaque bloc de règle [start,end] + identité ──
function tokenize(s) {
  const rules = []; const media = []; let i = 0, n = s.length, buf = '', bufStart = -1;
  const skipC = () => { i += 2; while (i < n && !(s[i] === '*' && s[i+1] === '/')) i++; i += 2; };
  const skipS = (q) => { const a = i; i++; while (i < n && s[i] !== q) { if (s[i] === '\\') i++; i++; } i++; return s.slice(a, i); };
  while (i < n) {
    const ch = s[i];
    if (ch === '/' && s[i+1] === '*') { skipC(); continue; }
    if (ch === '"' || ch === "'") { const str = skipS(ch); if (bufStart === -1) bufStart = i - str.length; buf += str; continue; }
    if (ch === '{') {
      const prelude = buf.trim(); const start = bufStart; buf = ''; const bs = bufStart; bufStart = -1;
      if (prelude.startsWith('@media')) { media.push(prelude.replace(/\s+/g, ' ')); i++; continue; }
      if (prelude.startsWith('@')) { let d = 1; i++; while (i < n && d > 0) { if (s[i]==='/'&&s[i+1]==='*'){skipC();continue;} if(s[i]==='"'||s[i]==="'"){skipS(s[i]);continue;} if (s[i]==='{')d++; else if(s[i]==='}')d--; i++; } continue; }
      let d = 1; i++; let body = '';
      while (i < n && d > 0) {
        if (s[i]==='/'&&s[i+1]==='*'){ skipC(); continue; }
        if (s[i]==='"'||s[i]==="'"){ body += skipS(s[i]); continue; }
        if (s[i]==='{') d++; else if (s[i]==='}') { d--; if (d===0){ i++; break; } }
        body += s[i]; i++;
      }
      rules.push({ start: bs, end: i, prelude, body, media: media.join(' >> ') });
      continue;
    }
    if (ch === '}') { if (media.length) media.pop(); buf=''; bufStart=-1; i++; continue; }
    if (buf === '' && /\s/.test(ch)) { i++; continue; }
    if (bufStart === -1) bufStart = i;
    buf += ch; i++;
  }
  return rules;
}

const normDecls = (b) => b.split(';').map(d=>d.trim()).filter(Boolean).map(d=>d.replace(/\s*:\s*/,':').replace(/\s+/g,' ').toLowerCase()).sort().join(';');
const normPrelude = (p) => p.split(',').map(x=>x.trim().replace(/\s+/g,' ')).sort().join(',');
const idOf = (r) => r.media + '||' + normPrelude(r.prelude) + '||' + normDecls(r.body);

const rules = tokenize(css);
// Groupes de blocs identiques.
const groups = new Map();
for (const r of rules) { const k = idOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const toRemove = [];
for (const [, g] of groups) {
  if (g.length < 2) continue;
  g.sort((a,b)=>a.start-b.start);
  for (let j = 0; j < g.length - 1; j++) toRemove.push(g[j]); // garde la DERNIÈRE
}
toRemove.sort((a,b)=>b.start-a.start); // retire de la fin vers le début (offsets stables)

let out = css;
for (const r of toRemove) {
  // étend la suppression aux espaces/saut de ligne qui suivent le bloc (évite lignes vides)
  let e = r.end; while (e < out.length && (out[e] === ' ' || out[e] === '\t')) e++; if (out[e] === '\n') e++;
  let st = r.start;
  out = out.slice(0, st) + out.slice(e);
}

// ── VÉRIFICATION : CSS résolu identique (winners par contexte||sélecteur) ──
function winners(source) {
  const rs = tokenize(source);
  const byKey = new Map(); // ctx||sel -> ordered [declsRaw...]
  for (const r of rs) {
    for (const sel of r.prelude.split(',').map(x=>x.trim()).filter(Boolean)) {
      const k = r.media + '||' + sel.replace(/\s+/g,' ');
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r.body);
    }
  }
  const resolved = new Map();
  for (const [k, bodies] of byKey) {
    const props = new Map(); // last wins
    for (const b of bodies) for (const d of b.split(';').map(x=>x.trim()).filter(Boolean)) {
      const idx = d.indexOf(':'); if (idx<0) continue;
      props.set(d.slice(0,idx).trim().toLowerCase(), d.slice(idx+1).trim().replace(/\s+/g,' '));
    }
    resolved.set(k, [...props.entries()].sort().map(([p,v])=>p+':'+v).join(';'));
  }
  return resolved;
}

const before = winners(css), after = winners(out);
const diffs = [];
const allKeys = new Set([...before.keys(), ...after.keys()]);
for (const k of allKeys) { if (before.get(k) !== after.get(k)) diffs.push(k); }

console.log('Règles totales (blocs):', rules.length);
console.log('Groupes dupliqués:', [...groups.values()].filter(g=>g.length>=2).length);
console.log('Blocs à retirer:', toRemove.length);
console.log('Taille: ', css.length, '→', out.length, '(', css.length-out.length, 'chars,', css.split('\n').length-out.split('\n').length, 'lignes)');
console.log('Clés CSS résolues:', before.size, '→', after.size);
console.log('DIFFS de CSS résolu:', diffs.length);
if (diffs.length) { console.log('⚠️ DIVERGENCES (abort) :'); diffs.slice(0,20).forEach(k=>console.log('  '+k+'\n    avant: '+before.get(k)+'\n    après: '+after.get(k))); process.exit(1); }
if (before.size !== after.size) { console.log('⚠️ nb de clés changé (un sélecteur a disparu) — abort'); process.exit(1); }

if (APPLY) { writeFileSync(FILE, out); console.log('\n✅ APPLIQUÉ : globals.css dédupliqué, CSS résolu PROUVÉ identique (0 diff).'); }
else console.log('\n✅ DRY-RUN OK : 0 diff de CSS résolu. Relancer avec --apply pour écrire.');
