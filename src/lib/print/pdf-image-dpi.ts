/**
 * Estimation du DPI EFFECTIF des images raster EMBARQUÉES dans un PDF (audit #4).
 *
 * Un PDF peut passer la validation de dimensions/bleed tout en contenant une photo
 * 72 DPI étirée plein cadre → impression floue. pdf-lib n'expose pas le placement des
 * images ; on passe donc par pdfjs `getOperatorList()` (déjà chargé côté client pour le
 * thumbnail) : on suit la matrice courante (CTM) le long du flux de contenu, et à chaque
 * dessin d'image on divise ses PIXELS sources par sa TAILLE DE RENDU (CTM·carré unité) →
 * DPI effectif. Vérifié empiriquement : 300px @ 1" = 300 DPI, @ 3" = 100 DPI.
 *
 * Le cœur (suivi CTM + calcul DPI) est PUR (aucune dépendance pdfjs) → testable avec des
 * listes d'opérateurs synthétiques. Le chargement pdfjs n'est qu'une fine glu best-effort.
 *
 * Anti FAUX-POSITIF (un faux avertissement = client agacé) :
 *  - on IGNORE les images sources minuscules (< 16 px : remplissages/dégradés/spacers,
 *    pas des photos) ;
 *  - on ignore les masques (image masks 1-bit) — non gérés ici, non pertinents qualité ;
 *  - DPI rendu en AVERTISSEMENT seulement (jamais un blocage) : c'est une ESTIMATION
 *    (formes imbriquées, skew… peuvent fausser) → on informe, on ne refuse pas.
 */

import type { ValidationIssue } from './pdf-validator';

const PT_PER_INCH = 72;
/** < ce DPI = très basse résolution (idéal 300). */
const LOW_DPI = 100;
/** < ce DPI = résolution réduite (avertissement doux). */
const SOFT_DPI = 150;
/** En-dessous, l'image source est trop petite pour être une photo (fill/spacer) → ignorée. */
const MIN_SOURCE_PX = 16;

/** Une image dessinée : pixels sources + taille de rendu (pouces). */
export interface EmbeddedImage {
  pixelW: number;
  pixelH: number;
  renderedWidthIn: number;
  renderedHeightIn: number;
}

export interface PdfImageDpiResult {
  issues: ValidationIssue[];
  /** DPI effectif le plus faible parmi les images mesurables (null si aucune). */
  minDpi: number | null;
  /** Nombre d'images prises en compte (après filtrage des minuscules). */
  imageCount: number;
}

/** Codes d'opérateurs pdfjs pertinents — injectés pour rendre l'extraction PURE/testable. */
export interface OpsCodes {
  save: number;
  restore: number;
  transform: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

type Matrix = number[]; // [a, b, c, d, e, f]
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Produit de matrices identique à pdfjs `Util.transform(m1, m2)` (vérifié). */
function mul(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function pushImage(out: EmbeddedImage[], ctm: Matrix, pixelW: number, pixelH: number): void {
  if (!Number.isFinite(pixelW) || !Number.isFinite(pixelH)) return;
  if (pixelW < MIN_SOURCE_PX || pixelH < MIN_SOURCE_PX) return; // fill/spacer, pas une photo
  // L'image est dessinée dans le carré unité [0,1]² transformé par la CTM :
  // largeur de rendu = |image de (1,0)|, hauteur = |image de (0,1)| (gère rotation).
  const renderedWidthIn = Math.hypot(ctm[0], ctm[1]) / PT_PER_INCH;
  const renderedHeightIn = Math.hypot(ctm[2], ctm[3]) / PT_PER_INCH;
  if (renderedWidthIn <= 0 || renderedHeightIn <= 0) return; // CTM dégénérée
  out.push({ pixelW, pixelH, renderedWidthIn, renderedHeightIn });
}

/**
 * Parcourt une liste d'opérateurs pdfjs, suit la CTM (save/restore/transform + form
 * XObjects), et collecte chaque image dessinée avec sa taille de rendu. PUR.
 */
export function extractImagesFromOpList(fnArray: number[], argsArray: unknown[][], ops: OpsCodes): EmbeddedImage[] {
  const out: EmbeddedImage[] = [];
  let ctm: Matrix = IDENTITY.slice();
  const stack: Matrix[] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i];
    if (fn === ops.save) {
      stack.push(ctm.slice());
    } else if (fn === ops.restore) {
      ctm = stack.pop() ?? IDENTITY.slice();
    } else if (fn === ops.transform) {
      if (Array.isArray(a) && a.length === 6) ctm = mul(ctm, a as Matrix);
    } else if (fn === ops.paintFormXObjectBegin) {
      // Une form XObject ouvre un sous-espace : save implicite + matrice de la forme.
      stack.push(ctm.slice());
      const m = a?.[0];
      if (Array.isArray(m) && m.length === 6) ctm = mul(ctm, m as Matrix);
    } else if (fn === ops.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY.slice();
    } else if (fn === ops.paintImageXObject) {
      // args = [objId, pixelWidth, pixelHeight]
      pushImage(out, ctm, Number(a?.[1]), Number(a?.[2]));
    } else if (fn === ops.paintInlineImageXObject) {
      // args = [imgData] avec width/height en pixels
      const img = a?.[0] as { width?: number; height?: number } | undefined;
      pushImage(out, ctm, Number(img?.width), Number(img?.height));
    }
    // paintImageMaskXObject (stencil 1-bit) volontairement ignoré.
  }
  return out;
}

/** Calcule le DPI effectif min + produit les avertissements (jamais bloquants). PUR. */
export function computeImageDpiIssues(images: EmbeddedImage[]): PdfImageDpiResult {
  let minDpi: number | null = null;
  let lowCount = 0;
  for (const img of images) {
    const dpi = Math.min(img.pixelW / img.renderedWidthIn, img.pixelH / img.renderedHeightIn);
    if (!Number.isFinite(dpi) || dpi <= 0) continue;
    if (minDpi === null || dpi < minDpi) minDpi = dpi;
    if (dpi < SOFT_DPI) lowCount++;
  }

  const issues: ValidationIssue[] = [];
  if (minDpi !== null && minDpi < SOFT_DPI) {
    const rounded = Math.round(minDpi);
    const subject = lowCount > 1
      ? `${lowCount} images intégrées sont`
      : `Une image intégrée est`;
    if (minDpi < LOW_DPI) {
      issues.push({
        level: 'warning',
        code: 'embedded-image-low-dpi',
        message: `${subject} en très basse résolution (la plus faible ~${rounded} DPI). Risque d'impression floue — vise 300 DPI à la taille finale.`,
      });
    } else {
      issues.push({
        level: 'warning',
        code: 'embedded-image-soft-dpi',
        message: `${subject} en résolution réduite (la plus faible ~${rounded} DPI). Pour un rendu net, vise 300 DPI.`,
      });
    }
  }
  return { issues, minDpi, imageCount: images.length };
}

/**
 * Glu best-effort : charge pdfjs, parcourt les pages (cap), extrait le DPI des images.
 * Ne throw JAMAIS — retourne un résultat vide sur échec (le caller n'est pas bloqué).
 */
export async function assessPdfImageDpi(file: File, maxPages = 4): Promise<PdfImageDpiResult> {
  try {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
    }
    const ops: OpsCodes = {
      save: pdfjs.OPS.save,
      restore: pdfjs.OPS.restore,
      transform: pdfjs.OPS.transform,
      paintImageXObject: pdfjs.OPS.paintImageXObject,
      paintInlineImageXObject: pdfjs.OPS.paintInlineImageXObject,
      paintFormXObjectBegin: pdfjs.OPS.paintFormXObjectBegin,
      paintFormXObjectEnd: pdfjs.OPS.paintFormXObjectEnd,
    };

    const bytes = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const all: EmbeddedImage[] = [];
    const pages = Math.min(doc.numPages, maxPages);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const ol = await page.getOperatorList();
      all.push(...extractImagesFromOpList(ol.fnArray, ol.argsArray as unknown[][], ops));
      await page.cleanup();
    }
    await doc.destroy();
    return computeImageDpiIssues(all);
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[pdf-image-dpi] estimation failed (non-blocking):', err);
    return { issues: [], minDpi: null, imageCount: 0 };
  }
}
