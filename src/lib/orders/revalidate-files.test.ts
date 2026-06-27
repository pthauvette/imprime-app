import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { revalidatePrintFiles } from './revalidate-files';

// productId 1 = cartes-de-visite (14pt standard) → mappe à un slug avec margin-spec.
const PID_CARTES = 1;
// productId hors de tout produit virtuel → slug undefined → seuls les contrôles
// STRUCTURELS s'appliquent (pas de comparaison de dimensions).
const PID_UNMAPPED = 99999999;

const HOST = 'plio-test.s3.ca-central-1.amazonaws.com';
const u = (name: string) => `https://${HOST}/uploads/${name}`;

async function pdfBytes(widthIn: number, heightIn: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([widthIn * 72, heightIn * 72]);
  return doc.save();
}

type Entry = { bytes?: Uint8Array; ct?: string; fail?: boolean };
/** fetch moqué par URL — chaque fichier peut avoir une issue différente. */
function mockFetchByUrl(map: Record<string, Entry>) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const key = String(input).split('?')[0];
    const e = map[key];
    if (!e || e.fail) {
      return { ok: false, status: 500, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const bytes = e.bytes!;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': e.ct ?? 'application/pdf', 'content-length': String(bytes.byteLength) }),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }));
}

beforeEach(() => {
  vi.stubEnv('S3_BUCKET', 'plio-test');
  vi.stubEnv('S3_REGION', 'ca-central-1');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('revalidatePrintFiles', () => {
  it('fichiers conformes → aucun blocker', async () => {
    mockFetchByUrl({ [u('a.pdf')]: { bytes: await pdfBytes(3.75, 2.25) } });
    const out = await revalidatePrintFiles([{ productId: PID_CARTES, files: [{ url: u('a.pdf') }] }]);
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe('ok');
    expect(out[0].blocking).toBe(false);
  });

  it('PDF corrompu → blocking (erreur de contenu)', async () => {
    mockFetchByUrl({ [u('bad.pdf')]: { bytes: new Uint8Array(300).fill(0x01) } });
    const out = await revalidatePrintFiles([{ productId: PID_UNMAPPED, files: [{ url: u('bad.pdf') }] }]);
    expect(out[0].level).toBe('error');
    expect(out[0].blocking).toBe(true);
    expect(out[0].issues[0].code).toBe('pdf-invalid');
  });

  it('échec de fetch S3 (infra) → fail-OPEN : level error MAIS blocking false', async () => {
    mockFetchByUrl({ [u('gone.pdf')]: { fail: true } });
    const out = await revalidatePrintFiles([{ productId: PID_UNMAPPED, files: [{ url: u('gone.pdf') }] }]);
    expect(out[0].level).toBe('error');
    expect(out[0].issues[0].code).toBe('fetch-failed');
    expect(out[0].blocking).toBe(false); // un hoquet S3 ne doit jamais bloquer un paiement
  });

  it('mauvaises dimensions (bonne structure) → warning, pas blocking', async () => {
    // 8.5×11 vs carte de visite typique 3.5×2 → hors tolérance, strict:false → warning.
    mockFetchByUrl({ [u('wrong-size.pdf')]: { bytes: await pdfBytes(8.5, 11) } });
    const out = await revalidatePrintFiles([{ productId: PID_CARTES, files: [{ url: u('wrong-size.pdf') }] }]);
    expect(out[0].level).toBe('warning');
    expect(out[0].blocking).toBe(false);
  });

  it('image (non-PDF) → délégué à Sinalite, jamais bloquant', async () => {
    mockFetchByUrl({ [u('art.png')]: { bytes: new Uint8Array(300).fill(0x42), ct: 'image/png' } });
    const out = await revalidatePrintFiles([{ productId: PID_CARTES, files: [{ url: u('art.png') }] }]);
    expect(out[0].level).toBe('ok');
    expect(out[0].blocking).toBe(false);
  });

  it('multi-items / multi-fichiers : seul le fichier corrompu bloque', async () => {
    mockFetchByUrl({
      [u('ok-front.pdf')]: { bytes: await pdfBytes(3.75, 2.25) },
      [u('bad-back.pdf')]: { bytes: new Uint8Array(300).fill(0x01) },
      [u('ok2.pdf')]: { bytes: await pdfBytes(3.75, 2.25) },
    });
    const out = await revalidatePrintFiles([
      { productId: PID_CARTES, files: [{ url: u('ok-front.pdf') }, { url: u('bad-back.pdf') }] },
      { productId: PID_CARTES, files: [{ url: u('ok2.pdf') }] },
    ]);
    expect(out).toHaveLength(3);
    const blockers = out.filter((o) => o.blocking);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].url).toBe(u('bad-back.pdf'));
  });

  it('URL hors bucket Plio (SSRF) → blocking, sans fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const out = await revalidatePrintFiles([{ productId: PID_CARTES, files: [{ url: 'https://evil.example/uploads/x.pdf' }] }]);
    expect(out[0].blocking).toBe(true);
    expect(out[0].issues[0].code).toBe('bad-file-url');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
