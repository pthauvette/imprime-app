/**
 * Tests pour le print-ready PDF validator.
 *
 * On utilise pdf-lib pour FABRIQUER des PDFs de test dans le test setup
 * (au lieu d'avoir des fichiers binaires committed dans le repo). Ça garde
 * les tests rapides et auto-documentés.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';
import { validatePdf, isPdfMime } from '@/lib/print/pdf-validator';

// ─── Helpers — fabriquent des PDFs de test ────────────────────────────────

const PT_PER_INCH = 72;

/** Fabrique un PDF avec N pages aux dimensions données. Retourne un File. */
async function makePdfFile(opts: {
  pages: number;
  widthInches: number;
  heightInches: number;
  filename?: string;
  /** TrimBox de la 1re page (pouces), centré dans le MediaBox. */
  trimIn?: [number, number];
  /** BleedBox de la 1re page (pouces), centré. */
  bleedIn?: [number, number];
  /** Rotation /Rotate de la 1re page (degrés). */
  rotate?: number;
}): Promise<File> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < opts.pages; i++) {
    pdf.addPage([opts.widthInches * PT_PER_INCH, opts.heightInches * PT_PER_INCH]);
  }
  const p0 = pdf.getPage(0);
  const centered = (sizeIn: [number, number]) => {
    const [w, h] = [sizeIn[0] * PT_PER_INCH, sizeIn[1] * PT_PER_INCH];
    return [(opts.widthInches * PT_PER_INCH - w) / 2, (opts.heightInches * PT_PER_INCH - h) / 2, w, h] as const;
  };
  if (opts.trimIn) { const [x, y, w, h] = centered(opts.trimIn); p0.setTrimBox(x, y, w, h); }
  if (opts.bleedIn) { const [x, y, w, h] = centered(opts.bleedIn); p0.setBleedBox(x, y, w, h); }
  if (opts.rotate) p0.setRotation(degrees(opts.rotate));
  const bytes = await pdf.save();
  // pdf-lib returns Uint8Array<ArrayBufferLike> ; File expects BlobPart.
  // Wrap in a fresh ArrayBuffer slice to satisfy the type (Node20+ Files
  // accept Uint8Array but TS lib.dom types still want ArrayBuffer-ish).
  return new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], opts.filename ?? 'test.pdf', { type: 'application/pdf' });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('validatePdf — file integrity', () => {
  it('OK pour un PDF valide 1 page', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file);
    expect(r.level).toBe('ok');
    expect(r.issues).toHaveLength(0);
    expect(r.meta?.pageCount).toBe(1);
  });

  it('ERROR si fichier trop petit (< 100 bytes)', async () => {
    const file = new File([new Uint8Array(50)], 'tiny.pdf', { type: 'application/pdf' });
    const r = await validatePdf(file);
    expect(r.level).toBe('error');
    expect(r.issues[0].code).toBe('file-too-small');
  });

  it('ERROR si fichier au-dessus de maxBytes', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file, { maxBytes: 200 });
    expect(r.level).toBe('error');
    expect(r.issues[0].code).toBe('file-too-large');
    expect(r.issues[0].message).toMatch(/Maximum/);
  });

  it('default maxBytes = 150 MB (R45 #3) : un fichier de 60 MB n\'est PAS file-too-large', async () => {
    // 60 MB > ancien défaut (50 MB), < nouveau défaut (150 MB, aligné S3).
    // Garbage → finit en pdf-invalid, mais surtout JAMAIS rejeté pour la taille
    // avec le défaut. Garde contre une régression vers 50 MB.
    const big = new File([new Uint8Array(60 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    const r = await validatePdf(big); // pas d'options → défaut 150 MB
    expect(r.issues.some((i) => i.code === 'file-too-large')).toBe(false);
  });

  it('ERROR si bytes ne sont pas un PDF (random data)', async () => {
    const garbage = new Uint8Array(2000).fill(0x42);
    const file = new File([garbage], 'fake.pdf', { type: 'application/pdf' });
    const r = await validatePdf(file);
    expect(r.level).toBe('error');
    expect(r.issues[0].code).toBe('pdf-invalid');
    expect(r.meta).toBeNull();
  });
});

describe('validatePdf — page count', () => {
  it('ERROR si pageCount < minPages', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file, { minPages: 2, maxPages: 2 });
    expect(r.level).toBe('error');
    expect(r.issues.some((i) => i.code === 'too-few-pages')).toBe(true);
  });

  it('WARNING si pageCount > maxPages (mais valide)', async () => {
    const file = await makePdfFile({ pages: 4, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file, { maxPages: 2 });
    expect(r.level).toBe('warning');
    const issue = r.issues.find((i) => i.code === 'too-many-pages');
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/2 premières seront imprimées/);
  });

  it('OK pour 2 pages avec maxPages=2 (cas recto-verso)', async () => {
    const file = await makePdfFile({ pages: 2, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file, { maxPages: 2 });
    expect(r.level).toBe('ok');
    expect(r.meta?.pageCount).toBe(2);
  });
});

describe('validatePdf — dimensions (no expected)', () => {
  it('WARNING (override) si dimensions très petites (< 0.5") — R45 #3', async () => {
    // Round 45 #3 — était error (hard block) ; maintenant warning overridable
    // (un petit format légitime ou une taille mal lue ne doit pas bloquer).
    const file = await makePdfFile({ pages: 1, widthInches: 0.1, heightInches: 0.1 });
    const r = await validatePdf(file);
    expect(r.level).toBe('warning');
    expect(r.issues.some((i) => i.code === 'dimensions-too-small')).toBe(true);
  });

  it('WARNING si dimensions très grandes (> 30")', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 50, heightInches: 50 });
    const r = await validatePdf(file);
    expect(r.level).toBe('warning');
    expect(r.issues.some((i) => i.code === 'dimensions-very-large')).toBe(true);
  });

  it('OK pour dimensions raisonnables 1"–30"', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 8.5, heightInches: 11 });
    const r = await validatePdf(file);
    expect(r.level).toBe('ok');
  });
});

describe('validatePdf — expected dimensions', () => {
  const businessCard = {
    widthInches: 3.5,
    heightInches: 2,
    bleedInches: 0.125,
  };

  it('OK quand dimensions = product size + bleed', async () => {
    // 3.5" + 2 * 0.125" = 3.75"  |  2" + 2 * 0.125" = 2.25"
    const file = await makePdfFile({ pages: 1, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file, { expected: businessCard });
    expect(r.level).toBe('ok');
  });

  it('OK si orientation inversée (paysage vs portrait)', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 2.25, heightInches: 3.75 });
    const r = await validatePdf(file, { expected: businessCard });
    expect(r.level).toBe('ok');
  });

  it('WARNING bleed-missing si dimensions = product size pile (sans bleed)', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.5, heightInches: 2 });
    const r = await validatePdf(file, { expected: businessCard });
    expect(r.level).toBe('warning');
    const issue = r.issues.find((i) => i.code === 'bleed-missing');
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/sans fond perdu/);
  });

  it('WARNING dimensions-mismatch si format totalement différent (non strict)', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 8.5, heightInches: 11 });
    const r = await validatePdf(file, { expected: businessCard });
    expect(r.level).toBe('warning');
    expect(r.issues.some((i) => i.code === 'dimensions-mismatch')).toBe(true);
  });

  it('STRICT : format totalement différent → ERROR bloquant', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 8.5, heightInches: 11 });
    const r = await validatePdf(file, { expected: businessCard, strictDimensions: true });
    expect(r.level).toBe('error');
    expect(r.issues.some((i) => i.code === 'dimensions-mismatch' && i.level === 'error')).toBe(true);
  });

  it('STRICT : bonne taille → OK (pas de faux blocage)', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file, { expected: businessCard, strictDimensions: true });
    expect(r.level).toBe('ok');
  });

  it('STRICT : bleed-missing reste WARNING (récupérable, pas bloquant)', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.5, heightInches: 2 });
    const r = await validatePdf(file, { expected: businessCard, strictDimensions: true });
    expect(r.level).toBe('warning');
    expect(r.issues.some((i) => i.code === 'bleed-missing')).toBe(true);
  });

  it('OK avec tolérance custom (1mm = 0.04")', async () => {
    // Target = 3.75 + bleed. PDF à 3.78" = 0.03" off. Avec tolérance 0.05 → OK.
    const file = await makePdfFile({ pages: 1, widthInches: 3.78, heightInches: 2.28 });
    const r = await validatePdf(file, { expected: { ...businessCard, toleranceInches: 0.05 } });
    expect(r.level).toBe('ok');
  });

  it('WARNING si bleed customisé absent', async () => {
    // Si bleed=0.25 attendu, target=4" × 2.5". PDF à 3.5 × 2 (no bleed) → bleed-missing
    const file = await makePdfFile({ pages: 1, widthInches: 3.5, heightInches: 2 });
    const r = await validatePdf(file, { expected: { ...businessCard, bleedInches: 0.25 } });
    const issue = r.issues.find((i) => i.code === 'bleed-missing');
    expect(issue).toBeDefined();
    expect(issue?.message).toMatch(/0\.25.+bleed/);
  });
});

describe('validatePdf — meta extraction', () => {
  it('extrait pageCount + dimensions pts/inches/mm', async () => {
    const file = await makePdfFile({ pages: 2, widthInches: 3.75, heightInches: 2.25 });
    const r = await validatePdf(file);
    expect(r.meta).not.toBeNull();
    expect(r.meta!.pageCount).toBe(2);
    expect(r.meta!.firstPageInches.width).toBe(3.75);
    expect(r.meta!.firstPageInches.height).toBe(2.25);
    expect(r.meta!.firstPagePts.width).toBe(270); // 3.75 * 72
    expect(r.meta!.firstPagePts.height).toBe(162); // 2.25 * 72
    expect(r.meta!.firstPageMm.width).toBeCloseTo(95.3, 1);
    expect(r.meta!.firstPageMm.height).toBeCloseTo(57.2, 1);
    expect(r.meta!.sizeBytes).toBe(file.size);
  });
});

describe('isPdfMime', () => {
  it('true pour application/pdf', () => {
    expect(isPdfMime('application/pdf')).toBe(true);
  });
  it('case-insensitive sur le suffix /pdf', () => {
    expect(isPdfMime('Application/PDF')).toBe(true);
  });
  it('false pour autres formats', () => {
    expect(isPdfMime('image/png')).toBe(false);
    expect(isPdfMime('image/vnd.adobe.photoshop')).toBe(false);
    expect(isPdfMime('application/postscript')).toBe(false);
  });
});

// ─── Vraies boîtes TrimBox/BleedBox (PDF/X pro) + rotation /Rotate ───────────
describe('validatePdf — vraies boîtes TrimBox/BleedBox', () => {
  const CARD = { widthInches: 3.5, heightInches: 2, bleedInches: 0.125 };

  it('MediaBox élargi par les marques + TrimBox=format + BleedBox=trim+bleed → conforme (plus de faux rejet)', async () => {
    // Export InDesign typique : MediaBox 4.25×2.75 (marques), TrimBox 3.5×2, BleedBox 3.75×2.25.
    const file = await makePdfFile({ pages: 1, widthInches: 4.25, heightInches: 2.75, trimIn: [3.5, 2], bleedIn: [3.75, 2.25] });
    const r = await validatePdf(file, { expected: CARD, strictDimensions: true });
    expect(r.level).toBe('ok');
    expect(r.issues.some((i) => i.code === 'dimensions-mismatch')).toBe(false);
  });

  it('TrimBox correct mais BleedBox = TrimBox (pas de fond perdu) → bleed-missing', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 3.5, heightInches: 2, trimIn: [3.5, 2], bleedIn: [3.5, 2] });
    const r = await validatePdf(file, { expected: CARD, strictDimensions: true });
    expect(r.issues.some((i) => i.code === 'bleed-missing')).toBe(true);
  });

  it('TrimBox = mauvais format (4×6) en strict → dimensions-mismatch ERROR', async () => {
    const file = await makePdfFile({ pages: 1, widthInches: 4.5, heightInches: 6.5, trimIn: [4, 6], bleedIn: [4.25, 6.25] });
    const r = await validatePdf(file, { expected: CARD, strictDimensions: true });
    expect(r.level).toBe('error');
    expect(r.issues.some((i) => i.code === 'dimensions-mismatch')).toBe(true);
  });
});

describe('validatePdf — rotation /Rotate', () => {
  const CARD = { widthInches: 3.5, heightInches: 2, bleedInches: 0.125 };
  it('page correcte stockée portrait + Rotate 90 → pas de faux mismatch + dimensions VISIBLES', async () => {
    // MediaBox 2.25×3.75 (portrait) + Rotate 90 = visible 3.75×2.25 (= format + bleed).
    const file = await makePdfFile({ pages: 1, widthInches: 2.25, heightInches: 3.75, rotate: 90 });
    const r = await validatePdf(file, { expected: CARD, strictDimensions: true });
    expect(r.level).toBe('ok');
    expect(r.meta?.firstPageInches).toEqual({ width: 3.75, height: 2.25 });
  });
});
