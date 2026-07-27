/**
 * Render thumbnail PNG/JPEG de la page 1 d'un PDF, côté client (browser).
 *
 * Utilise pdfjs-dist (Mozilla PDF.js) — ~1MB. Dynamic-imported pour ne pas
 * impacter le First Load JS des autres pages. Loadé uniquement quand
 * l'user upload un PDF dans /order/upload.
 *
 * Stratégie :
 *   1. Configure pdfjs-dist worker source en 1st-party (finding [93]/[94] —
 *      pointait vers un CDN tiers jsdelivr.net, cassait dès CSP enforce ;
 *      copie statique dans /public/vendor, cf. commentaire plus bas)
 *   2. Parse le PDF depuis ArrayBuffer
 *   3. Render page 1 sur canvas à largeur 400px
 *   4. Export en data URL JPEG quality 0.75 (compact pour state React)
 *
 * Pourquoi pas server-side : éviter de payer un Lambda warm-up + le coût
 * réseau pour upload puis re-download du PDF. Client-side = instant
 * feedback visuel pendant que l'upload S3 commence en parallèle.
 *
 * @returns Data URL prête pour <img src={}> ou null si le render échoue
 *          (PDF chiffré, page complexe, browser sans canvas, etc.).
 *          Caller affiche un fallback (filename text).
 */

export interface ThumbnailOptions {
  /** Largeur en pixels. Default 400. Hauteur calculée pour préserver l'aspect. */
  maxWidth?: number;
  /** Qualité JPEG 0-1. Default 0.75. */
  quality?: number;
}

const DEFAULT_MAX_WIDTH = 400;
const DEFAULT_QUALITY = 0.75;

/**
 * Render la 1ère page du PDF en data URL JPEG. Ne throw jamais —
 * retourne null sur erreur (caller fait fallback).
 */
export async function renderPdfThumbnail(
  file: File,
  options: ThumbnailOptions = {},
): Promise<string | null> {
  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = options.quality ?? DEFAULT_QUALITY;

  try {
    // Dynamic import — ~1MB, on charge seulement quand on en a besoin
    const pdfjs = await import('pdfjs-dist');

    // finding [93]/[94] — 1st-party (avant : CDN jsdelivr.net, cassait dès
    // CSP enforce sur worker-src/script-src). Copie statique dans
    // /public/vendor/pdf.worker.min.mjs — À RE-COPIER si pdfjs-dist est
    // upgradé (cf. node_modules/pdfjs-dist/build/pdf.worker.min.mjs), sinon
    // désalignement de version worker/lib.
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    }

    const bytes = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);

    // Compute scale pour atteindre maxWidth (à 72 DPI base)
    const viewport1x = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / viewport1x.width, 3); // cap à 3x pour pas exploser la mémoire
    const viewport = page.getViewport({ scale });

    // Create canvas (browser only — fail gracefully si pas dispo)
    if (typeof document === 'undefined') {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Render
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const dataUrl = canvas.toDataURL('image/jpeg', quality);

    // Cleanup
    await page.cleanup();
    await doc.destroy();

    return dataUrl;
  } catch (err) {
    // Tous les fails (encrypted, malformed, OOM, worker fail) retournent null.
    // Le caller affiche un fallback (filename text) sans bloquer l'upload.
    if (typeof console !== 'undefined') {
      console.warn('[pdf-thumbnail] render failed:', err);
    }
    return null;
  }
}
