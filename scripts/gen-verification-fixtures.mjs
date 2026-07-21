#!/usr/bin/env node
/**
 * gen-verification-fixtures.mjs — fabrique des PDF de test print-ready pour la
 * vérif manuelle/navigateur du flux d'upload Plio (audit #402/#403 overlay,
 * #407 DPI images intégrées, #388 validation stricte de taille).
 *
 * Génère 4 fixtures « cartes d'affaires » (family cartes-de-visite, trim 3,5×2",
 * bleed 0,125"/côté — cf. src/lib/products/margin-specs.ts) :
 *   1. carte-CONFORME-3.5x2-bleed.pdf   → doit passer (level ok). Overlay trim+bleed alignés.
 *   2. carte-IMAGE-BASSE-RES.pdf        → avertissement DPI (#407), taille OK par ailleurs.
 *   3. carte-SANS-FOND-PERDU.pdf        → avertissement bleed-missing (bonne taille, pas de bleed).
 *   4. carte-MAUVAISE-TAILLE-5x3.pdf    → dimensions-mismatch (warning MCP / bloqué upload web strict).
 *
 * Auto-vérification incluse : relit chaque PDF (pdf-lib) pour confirmer MediaBox/
 * TrimBox/BleedBox, et lance pdfjs sur le fichier basse-res pour confirmer le DPI
 * effectif estimé < 100. Sort en code 1 si une fixture ne correspond pas à l'intention.
 *
 * Usage : node scripts/gen-verification-fixtures.mjs [dossier_sortie]
 *   (défaut : ./verification-fixtures)
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import zlib from 'node:zlib';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const PT = 72; // points par pouce
const OUT = process.argv[2] ?? path.resolve(process.cwd(), 'verification-fixtures');

// ── Encodeur PNG minimal (8-bit RGB) — évite d'ajouter sharp/canvas ───────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
/** Petit PNG RGB avec un motif visible (dégradé + damier) → clairement une « photo ». */
function makePng(width, height) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const checker = ((x >> 3) + (y >> 3)) & 1;
      raw[o++] = Math.round((x / width) * 255); // R dégradé horizontal
      raw[o++] = Math.round((y / height) * 255); // G dégradé vertical
      raw[o++] = checker ? 200 : 60; // B damier
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// ── Helpers dessin ────────────────────────────────────────────────────────────
function strokeRect(page, xIn, yIn, wIn, hIn, color, dash) {
  page.drawRectangle({
    x: xIn * PT, y: yIn * PT, width: wIn * PT, height: hIn * PT,
    borderColor: color, borderWidth: 1, borderDashArray: dash, opacity: 0,
  });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
async function baseCard({ trimW, trimH, bleed, withBoxes }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const mediaW = (trimW + bleed * 2) * PT;
  const mediaH = (trimH + bleed * 2) * PT;
  const page = doc.addPage([mediaW, mediaH]);
  page.setMediaBox(0, 0, mediaW, mediaH);
  if (withBoxes && bleed > 0) {
    page.setBleedBox(0, 0, mediaW, mediaH); // bleed = media (bord de coupe étendu)
    page.setTrimBox(bleed * PT, bleed * PT, trimW * PT, trimH * PT); // trim inset du bleed
  }
  return { doc, page, font, mediaW, mediaH };
}

async function genConforme() {
  const bleed = 0.125, trimW = 3.5, trimH = 2;
  const { doc, page, font, mediaW, mediaH } = await baseCard({ trimW, trimH, bleed, withBoxes: true });
  // Fond bleed plein (atteint le bord de coupe).
  page.drawRectangle({ x: 0, y: 0, width: mediaW, height: mediaH, color: rgb(0.09, 0.16, 0.32) });
  // Repères visuels : ligne de TRIM et ligne de SAFE dessinées à leur position réelle.
  strokeRect(page, bleed, bleed, trimW, trimH, rgb(0.95, 0.4, 0.2)); // trim (orange)
  strokeRect(page, bleed + 0.125, bleed + 0.125, trimW - 0.25, trimH - 0.25, rgb(0.4, 0.85, 0.55), [3, 3]); // safe (vert pointillé)
  page.drawText('PLIO — carte 3,5 x 2 po', { x: (bleed + 0.28) * PT, y: (bleed + trimH / 2) * PT, size: 12, font, color: rgb(1, 1, 1) });
  page.drawText('fond perdu 0,125 po', { x: (bleed + 0.28) * PT, y: (bleed + trimH / 2 - 0.28) * PT, size: 8, font, color: rgb(0.8, 0.86, 1) });
  return doc.save();
}

async function genLowRes() {
  const bleed = 0.125, trimW = 3.5, trimH = 2;
  const { doc, page, mediaW, mediaH } = await baseCard({ trimW, trimH, bleed, withBoxes: true });
  // Image 120x80 px étirée plein cadre (3,75 x 2,25 po) → ~32 DPI effectif.
  const png = await doc.embedPng(makePng(120, 80));
  page.drawImage(png, { x: 0, y: 0, width: mediaW, height: mediaH });
  return doc.save();
}

async function genNoBleed() {
  const trimW = 3.5, trimH = 2;
  // Pas de bleed, pas de boîtes → MediaBox = trim exact. Déclenche bleed-missing.
  const { doc, page, font, mediaW, mediaH } = await baseCard({ trimW, trimH, bleed: 0, withBoxes: false });
  page.drawRectangle({ x: 0, y: 0, width: mediaW, height: mediaH, color: rgb(0.13, 0.13, 0.15) });
  page.drawText('3,5 x 2 po — SANS fond perdu', { x: 0.28 * PT, y: (trimH / 2) * PT, size: 11, font, color: rgb(1, 0.85, 0.4) });
  return doc.save();
}

async function genWrongSize() {
  const bleed = 0.125, trimW = 5, trimH = 3; // ≠ 3,5 x 2 attendu
  const { doc, page, font, mediaW, mediaH } = await baseCard({ trimW, trimH, bleed, withBoxes: true });
  page.drawRectangle({ x: 0, y: 0, width: mediaW, height: mediaH, color: rgb(0.3, 0.08, 0.08) });
  page.drawText('MAUVAISE TAILLE 5 x 3 po', { x: (bleed + 0.3) * PT, y: (bleed + trimH / 2) * PT, size: 14, font, color: rgb(1, 0.8, 0.8) });
  return doc.save();
}

// ── Auto-vérification ───────────────────────────────────────────────────────
const inches = (b) => ({ w: +(b.width / PT).toFixed(3), h: +(b.height / PT).toFixed(3) });

async function verifyGeometry(file, expect) {
  const bytes = await readFile(file);
  const doc = await PDFDocument.load(bytes);
  const p = doc.getPage(0);
  const media = inches(p.getMediaBox()), trim = inches(p.getTrimBox()), bleed = inches(p.getBleedBox());
  const ok = expect(media, trim, bleed);
  console.log(`   media ${media.w}x${media.h}"  trim ${trim.w}x${trim.h}"  bleed ${bleed.w}x${bleed.h}"  → ${ok ? '✓' : '✗ INATTENDU'}`);
  return ok;
}

async function verifyLowResDpi(file) {
  // pdfjs en Node (build legacy, sans worker) → getOperatorList → DPI effectif.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await readFile(file));
  const doc = await pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  const page = await doc.getPage(1);
  const ol = await page.getOperatorList();
  const OPS = pdfjs.OPS;
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (m1, m2) => [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  let minDpi = Infinity;
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform && Array.isArray(a) && a.length === 6) ctm = mul(ctm, a);
    else if (fn === OPS.paintImageXObject) {
      const pw = Number(a?.[1]), ph = Number(a?.[2]);
      if (pw >= 16 && ph >= 16) {
        const rwIn = Math.hypot(ctm[0], ctm[1]) / PT, rhIn = Math.hypot(ctm[2], ctm[3]) / PT;
        if (rwIn > 0 && rhIn > 0) minDpi = Math.min(minDpi, pw / rwIn, ph / rhIn);
      }
    }
  }
  await doc.destroy();
  const finite = Number.isFinite(minDpi);
  console.log(`   DPI effectif estimé : ${finite ? Math.round(minDpi) + ' DPI' : 'aucune image mesurée'}  → ${finite && minDpi < 100 ? '✓ (< 100 = avertissement « très basse résolution »)' : '✗ INATTENDU'}`);
  return finite && minDpi < 100;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const files = {
    conforme: path.join(OUT, 'carte-CONFORME-3.5x2-bleed.pdf'),
    lowres: path.join(OUT, 'carte-IMAGE-BASSE-RES.pdf'),
    nobleed: path.join(OUT, 'carte-SANS-FOND-PERDU.pdf'),
    wrong: path.join(OUT, 'carte-MAUVAISE-TAILLE-5x3.pdf'),
  };
  await writeFile(files.conforme, await genConforme());
  await writeFile(files.lowres, await genLowRes());
  await writeFile(files.nobleed, await genNoBleed());
  await writeFile(files.wrong, await genWrongSize());

  console.log(`\nFixtures écrites dans ${OUT}\n`);
  let allOk = true;
  const near = (a, b, t = 0.03) => Math.abs(a - b) <= t;

  console.log('1. CONFORME (attendu : ok — trim 3,5x2, bleed 3,75x2,25) :');
  allOk &= await verifyGeometry(files.conforme, (m, t, b) => near(t.w, 3.5) && near(t.h, 2) && near(b.w, 3.75) && near(b.h, 2.25));

  console.log('2. IMAGE BASSE RES (attendu : avertissement DPI, géométrie conforme) :');
  allOk &= await verifyGeometry(files.lowres, (m, t) => near(t.w, 3.5) && near(t.h, 2));
  allOk &= await verifyLowResDpi(files.lowres);

  console.log('3. SANS FOND PERDU (attendu : bleed-missing — media = trim 3,5x2, pas de boîtes) :');
  allOk &= await verifyGeometry(files.nobleed, (m, t) => near(m.w, 3.5) && near(m.h, 2) && near(t.w, 3.5) && near(t.h, 2));

  console.log('4. MAUVAISE TAILLE (attendu : dimensions-mismatch — trim 5x3 ≠ 3,5x2) :');
  allOk &= await verifyGeometry(files.wrong, (m, t) => near(t.w, 5) && near(t.h, 3));

  console.log(`\n${allOk ? '✓ Toutes les fixtures correspondent à leur intention.' : '✗ Au moins une fixture est inattendue.'}\n`);
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
