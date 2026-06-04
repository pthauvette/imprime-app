/**
 * Script one-off — mappe le catalogue Sinalite réel (auth + /product + détails).
 * NE COMMIT PAS de secret : lit .env.local, n'affiche que noms/options produits.
 *
 * Usage : node scripts/sinalite-map.mjs [familySlug]
 *   sans arg  → résumé global (count par catégorie)
 *   familySlug→ deep-dive : liste produits + groupes d'options de la famille
 */
import { readFileSync } from 'node:fs';

// ─── env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}
const E = loadEnv();

// ─── auth ───────────────────────────────────────────────────────────────────
async function getToken() {
  const res = await fetch(`${E.SINALITE_AUTH_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: E.SINALITE_CLIENT_ID,
      client_secret: E.SINALITE_CLIENT_SECRET,
      audience: E.SINALITE_AUDIENCE,
      grant_type: 'client_credentials',
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`Auth failed: ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

async function api(token, endpoint) {
  const res = await fetch(`${E.SINALITE_API_BASE}${endpoint}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${endpoint} → ${res.status}`);
  return res.json();
}

// ─── families (copié de src/lib/catalogue.ts) ───────────────────────────────
const FAMILIES = {
  'cartes-de-visite': ['Business Cards', 'Specialty Business Cards', 'Folded Business Cards'],
  'flyers': ['Flyers', 'Unaddressed Admail'],
  'cartes-postales': ['Postcards', 'Specialty Post Cards', 'Postcard Addressed', 'Postcard Enveloped and Addressed'],
  'brochures': ['Brochures', 'Booklets', 'Brochure Enveloped and Addressed', 'Tear Cards'],
  'bannieres': ['Vinyl Banners', 'Pull Up Banners', 'Pull Up Banners-', 'X-Frame Banners', 'A-Frame Signs', 'A Frame Stands', 'H Stands for Signs', 'Coroplast Signs & Yard Signs', 'Coroplast Signs & Yard Signs-', 'Aluminum Signs', 'Foam Board', 'Sintra/Rigid Board', 'Styrene Signs', 'Plastics', 'Large Format Posters', 'Posters', 'Yard Sign', 'Table Covers'],
  'stationnerie': ['Letterhead', 'Envelopes', 'Notepads', 'NCR Forms', 'Presentation Folders', 'Numbered Tickets', 'Wall Calendars', 'Greeting Cards', 'Specialty Greeting Cards', 'Invitations', 'Tent Cards', 'Bookmarks', 'Door Hangers'],
  'etiquettes': ['Roll Labels / Stickers', 'Square Cut Labels / Stickers', 'Clings', 'Floor Graphics', 'Window Graphics', 'Wall Decals', 'Adhesive Vinyl', 'White Vinyl', 'Magnets', 'Car Magnets', 'Covid-19-Decals', 'Covid-19-Decals-'],
  'photo-decor': ['Canvas', 'Display Board / POP', 'Sample Kits', 'Supply Boxes', 'Variable Printing', 'Digital Sheets'],
};

async function main() {
  const familySlug = process.argv[2];
  const token = await getToken();
  console.log('✓ auth ok\n');

  const products = await api(token, '/product');
  const enabled = products.filter((p) => p.enabled === 1);
  console.log(`PRODUITS : ${products.length} total · ${enabled.length} activés (enabled=1)\n`);

  // Count par catégorie
  const byCat = {};
  for (const p of enabled) (byCat[p.category] ??= []).push(p);
  console.log('═══ CATÉGORIES (activées) ═══');
  for (const [cat, ps] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ps.length).padStart(3)} × ${cat}`);
  }

  if (!familySlug) {
    console.log('\n→ relance avec un slug de famille pour le deep-dive, ex: node scripts/sinalite-map.mjs cartes-de-visite');
    return;
  }

  const cats = FAMILIES[familySlug];
  if (!cats) { console.log(`\nFamille inconnue: ${familySlug}. Dispo: ${Object.keys(FAMILIES).join(', ')}`); return; }

  const famProducts = enabled.filter((p) => cats.includes(p.category));
  console.log(`\n═══ DEEP-DIVE famille "${familySlug}" (${cats.join(', ')}) — ${famProducts.length} produits ═══`);

  for (const p of famProducts) {
    let detail;
    try {
      detail = await api(token, `/product/${p.id}/${E.SINALITE_STORE_CODE}`);
    } catch (e) {
      console.log(`\n  #${p.id} ${p.name} — détail KO (${e.message})`);
      continue;
    }
    const options = Array.isArray(detail) ? detail[0] : detail.options;
    const groups = {};
    for (const o of options ?? []) (groups[o.group] ??= []).push(o.name);
    console.log(`\n  #${p.id} · ${p.name}  [${p.category}] sku=${p.sku}`);
    for (const [g, names] of Object.entries(groups)) {
      const uniq = [...new Set(names)];
      console.log(`      ${g}: ${uniq.slice(0, 12).join(' | ')}${uniq.length > 12 ? ` … (+${uniq.length - 12})` : ''}`);
    }
  }
}

// ─── builder de mapping (grille papier × finish → productId) ────────────────
// Heuristique de parsing depuis le NOM (Sinalite n'expose pas ces axes en data
// structurée). À VALIDER par un humain — c'est un DRAFT.
function paperOf(name) {
  const n = name.toLowerCase();
  if (/\bkraft\b/.test(n)) return 'Kraft';
  if (/\bpearl\b/.test(n)) return 'Perle';
  if (/synthetic|durable/.test(n)) return 'Synthétique';
  if (/\blinen\b/.test(n)) return 'Lin';
  if (/enviro/.test(n)) return 'Recyclé';
  if (/ultra smooth/.test(n)) return 'Ultra lisse';
  if (/18pt/.test(n)) return '18pt';
  if (/16pt/.test(n)) return '16pt';
  if (/14pt/.test(n)) return '14pt';
  if (/13pt/.test(n)) return '13pt';
  return '?';
}
function finishOf(name) {
  const n = name.toLowerCase();
  if (/foil/.test(n)) return 'Foil métallique';
  if (/die cut/.test(n)) return 'Découpe (die cut)';
  if (/soft touch/.test(n)) return 'Soft touch';
  if (/gloss lamination/.test(n)) return 'Lamination glossy';
  if (/matte.*lamination|lamination.*matte/.test(n)) return 'Lamination mate';
  if (/writable/.test(n)) return 'Inscriptible (writable)';
  if (/\buv\b|high gloss/.test(n)) return 'UV high gloss';
  if (/matte|satin/.test(n)) return 'Mat';
  if (/\baq\b/.test(n)) return 'AQ (glossy léger)';
  if (/uncoated|enviro/.test(n)) return 'Sans couche';
  if (/profit maximizer|ultra smooth|durable|pearl/.test(n)) return 'Standard';
  return 'Standard';
}

async function buildMap() {
  const token = await getToken();
  const products = (await api(token, '/product')).filter((p) => p.enabled === 1);
  const cats = FAMILIES['cartes-de-visite'];
  const fam = products.filter((p) => cats.includes(p.category));

  const SPECIALTY = new Set(['Foil métallique', 'Découpe (die cut)']);
  const SPECIALTY_PAPER = new Set(['Kraft', 'Perle', 'Synthétique', 'Lin', 'Recyclé', 'Ultra lisse']);

  const grid = {};   // paper → finish → {id, name}
  const specialty = []; // produits hors-grille
  for (const p of fam) {
    const paper = paperOf(p.name);
    const finish = finishOf(p.name);
    const isFolded = p.category === 'Folded Business Cards';
    if (isFolded || SPECIALTY.has(finish) || SPECIALTY_PAPER.has(paper)) {
      specialty.push({ id: p.id, name: p.name.trim(), category: p.category, paper, finish });
    } else {
      (grid[paper] ??= {})[finish] = { id: p.id, name: p.name.trim() };
    }
  }
  return { grid, specialty, total: fam.length };
}

// ─── mode --all : toutes les familles, avec détails (concurrence) ───────────
async function buildAll() {
  const token = await getToken();
  const products = (await api(token, '/product')).filter((p) => p.enabled === 1);
  const catToFam = {};
  for (const [fam, cats] of Object.entries(FAMILIES)) for (const c of cats) catToFam[c] = fam;

  const POOL = 6;
  const out = [];
  for (let i = 0; i < products.length; i += POOL) {
    const batch = products.slice(i, i + POOL);
    const got = await Promise.all(batch.map(async (p) => {
      const family = catToFam[p.category] ?? '(autre)';
      try {
        const detail = await api(token, `/product/${p.id}/${E.SINALITE_STORE_CODE}`);
        const opts = Array.isArray(detail) ? detail[0] : detail.options;
        const groups = {};
        for (const o of opts ?? []) (groups[o.group] ??= []).push(o.name);
        return { id: p.id, name: p.name.trim(), category: p.category, sku: p.sku, family, groups };
      } catch (e) {
        return { id: p.id, name: p.name.trim(), category: p.category, sku: p.sku, family, groups: null, err: e.message };
      }
    }));
    out.push(...got);
    process.stderr.write(`\r  détails ${Math.min(i + POOL, products.length)}/${products.length}`);
  }
  process.stderr.write('\n');
  return out;
}

async function run() {
  if (process.argv[2] === '--all') {
    const all = await buildAll();
    const byFam = {};
    for (const r of all) (byFam[r.family] ??= []).push(r);
    const order = [...Object.keys(FAMILIES), '(autre)'];
    for (const fam of order) {
      const items = byFam[fam];
      if (!items?.length) continue;
      const groupNames = new Set();
      for (const it of items) for (const g of Object.keys(it.groups ?? {})) groupNames.add(g);
      console.log(`\n═══ ${fam} (${items.length} produits) ═══`);
      console.log(`  AXES (groupes d'options rencontrés) : ${[...groupNames].join(' · ')}`);
      for (const it of items) {
        const g = it.groups ?? {};
        const stock = (g.Stock ?? []).length;
        const coat = g.Coating ?? g['Coating / Finish'] ?? g.Lamination ?? [];
        const sizes = (g.size ?? []).length;
        const qty = g.qty ?? [];
        const qrange = qty.length ? `${qty[0]}–${qty[qty.length - 1]}` : '—';
        console.log(`    #${String(it.id).padEnd(6)} ${it.name.slice(0, 46).padEnd(46)} stock×${stock} finis[${coat.slice(0, 3).join('/').slice(0, 30)}] size×${sizes} qty ${qrange}`);
      }
    }
    const { writeFileSync } = await import('node:fs');
    writeFileSync(new URL('../docs/sinalite-catalogue-map.draft.json', import.meta.url), JSON.stringify(byFam, null, 2));
    console.log(`\n✓ écrit docs/sinalite-catalogue-map.draft.json (${all.length} produits, ${Object.keys(byFam).length} familles)`);
    return;
  }
  if (process.argv[2] === '--map') {
    const map = await buildMap();
    const out = JSON.stringify(map, null, 2);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(new URL('../docs/sinalite-card-map.draft.json', import.meta.url), out);
    console.log('═══ GRILLE STANDARD (papier × finish → productId) ═══');
    for (const [paper, finishes] of Object.entries(map.grid)) {
      console.log(`\n  ${paper}`);
      for (const [finish, v] of Object.entries(finishes)) {
        console.log(`      ${finish.padEnd(26)} → #${v.id}  (${v.name})`);
      }
    }
    console.log(`\n═══ SPECIALTY (hors grille — ${map.specialty.length}) ═══`);
    for (const s of map.specialty) console.log(`      #${s.id}  ${s.name}  [${s.paper}/${s.finish}]`);
    console.log(`\n✓ écrit docs/sinalite-card-map.draft.json (${map.total} produits cartes)`);
    return;
  }
  return main();
}

run().catch((e) => { console.error('ERREUR:', e.message); process.exit(1); });
