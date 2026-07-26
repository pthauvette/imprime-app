import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { validatePrintFile, formatValidatePrintFileText } from './validate-file';

const HOST = 'plio-test.s3.ca-central-1.amazonaws.com';
const okUrl = (name = 'uploads/guest/abc-front.pdf') => `https://${HOST}/${name}`;

/** Génère un vrai PDF d'une page (dimensions en pouces). */
async function pdfBytes(widthIn: number, heightIn: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([widthIn * 72, heightIn * 72]);
  return doc.save();
}

/** Génère un PDF multi-pages (pour tester le plafond maxPages). */
async function multiPagePdfBytes(pageCount: number, widthIn = 8.5, heightIn = 11): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([widthIn * 72, heightIn * 72]);
  return doc.save();
}

function mockFetch(bytes: Uint8Array, contentType = 'application/pdf', ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok, status,
    headers: new Headers({ 'content-type': contentType, 'content-length': String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })));
}

beforeEach(() => {
  vi.stubEnv('S3_BUCKET', 'plio-test');
  vi.stubEnv('S3_REGION', 'ca-central-1');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('validatePrintFile — anti-SSRF', () => {
  it('URL hors bucket Plio → erreur bloquante (aucun fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await validatePrintFile({ fileUrl: 'https://evil.example/uploads/x.pdf' });
    expect(r.level).toBe('error');
    expect(r.blocking).toBe(true);
    expect(r.issues[0].code).toBe('bad-file-url');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('URL Plio mais hors /uploads/ → rejetée', async () => {
    const r = await validatePrintFile({ fileUrl: `https://${HOST}/secret/x.pdf` });
    expect(r.issues[0].code).toBe('bad-file-url');
  });
});

describe('validatePrintFile — PDF', () => {
  it('bonne taille (3.75×2.25 = carte de visite + bleed) → conforme, meta présente', async () => {
    mockFetch(await pdfBytes(3.75, 2.25));
    const r = await validatePrintFile({ fileUrl: okUrl(), slug: 'cartes-de-visite' });
    expect(r.fileType).toBe('pdf');
    expect(r.level).toBe('ok');
    expect(r.blocking).toBe(false);
    expect(r.meta?.pageCount).toBe(1);
    expect(r.meta?.firstPageInches).toEqual({ width: 3.75, height: 2.25 });
    expect(r.delegatedToSinalite).toContain('couleur (CMYK/RGB)');
  });

  it('mauvaise taille → WARNING (jamais bloquant : on n\'a que la taille typique)', async () => {
    mockFetch(await pdfBytes(8.5, 11));
    const r = await validatePrintFile({ fileUrl: okUrl(), slug: 'cartes-de-visite' });
    expect(r.level).toBe('warning');
    expect(r.blocking).toBe(false);
    expect(r.issues.some((i) => i.code === 'dimensions-mismatch')).toBe(true);
  });

  it('slug inconnu → pas de comparaison de taille (aucun faux warning dimension)', async () => {
    mockFetch(await pdfBytes(8.5, 11));
    const r = await validatePrintFile({ fileUrl: okUrl(), slug: 'totally-fake' });
    expect(r.issues.some((i) => i.code === 'dimensions-mismatch')).toBe(false);
  });

  // Finding [24] : un livret 16 pages est un fichier VALIDE pour ce produit —
  // pas un « as-tu oublié des pages ? ».
  it('livret 16 pages (slug=livrets) → PAS de warning too-many-pages', async () => {
    mockFetch(await multiPagePdfBytes(16));
    const r = await validatePrintFile({ fileUrl: okUrl(), slug: 'livrets' });
    expect(r.issues.some((i) => i.code === 'too-many-pages')).toBe(false);
    expect(r.meta?.pageCount).toBe(16);
  });

  it('même fichier 16 pages, produit NON multi-pages (carte de visite) → warning conservé', async () => {
    mockFetch(await multiPagePdfBytes(16));
    const r = await validatePrintFile({ fileUrl: okUrl(), slug: 'cartes-de-visite' });
    expect(r.issues.some((i) => i.code === 'too-many-pages')).toBe(true);
  });
});

describe('validatePrintFile — non-PDF + erreurs infra', () => {
  it('image → délégué Sinalite (pas de blocage)', async () => {
    mockFetch(new Uint8Array([1, 2, 3]), 'image/jpeg');
    const r = await validatePrintFile({ fileUrl: okUrl('uploads/guest/x-front.jpg'), slug: 'cartes-de-visite' });
    expect(r.fileType).toBe('image');
    expect(r.level).toBe('ok');
    expect(r.delegatedToSinalite).toContain('couleur (CMYK/RGB)');
  });

  it('téléchargement KO → fetch-failed (erreur infra, fileType other)', async () => {
    mockFetch(new Uint8Array([1]), 'application/pdf', false, 404);
    const r = await validatePrintFile({ fileUrl: okUrl() });
    expect(r.fileType).toBe('other');
    expect(r.issues[0].code).toBe('fetch-failed');
  });
});

describe('formatValidatePrintFileText', () => {
  it('formate un résultat conforme (✅) avec les dimensions', async () => {
    mockFetch(await pdfBytes(3.75, 2.25));
    const r = await validatePrintFile({ fileUrl: okUrl(), slug: 'cartes-de-visite' });
    const txt = formatValidatePrintFileText(r);
    expect(txt).toContain('✅');
    expect(txt).toContain('3.75');
    expect(txt).toContain('couleur');
  });
});
