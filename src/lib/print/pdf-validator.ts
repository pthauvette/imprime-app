/**
 * Validation client-side d'un PDF print-ready avant upload S3.
 *
 * Stratégie : on parse le PDF dans le browser avec pdf-lib (pure JS, ~250kb)
 * AVANT l'upload pour donner du feedback immédiat. Évite de gaspiller la
 * bande passante (et de salir le bucket S3) avec des fichiers évidemment
 * mauvais — typo de format, mauvais nombre de pages, dimensions absurdes.
 *
 * Ce qu'on valide :
 *   1. Le fichier est un PDF valide qui parse
 *   2. Le nombre de pages est dans la fourchette attendue
 *   3. Les dimensions de la 1ère page sont raisonnables (ou matchent les
 *      dimensions attendues + bleed si fournies)
 *   4. Taille du fichier dans la limite (cf. MAX_FILE_SIZE_BYTES côté S3)
 *
 * Ce qu'on ne valide PAS (encore) :
 *   - DPI des images embedded : pdf-lib n'expose pas facilement les streams
 *     d'images. Sinalite va catch les images <300dpi côté production. À
 *     implémenter en v2 avec une analyse du content stream.
 *   - Espace colorimétrique (CMYK vs RGB) : idem, requirerait un parsing
 *     plus profond. Most modern designers exportent en CMYK de toute façon.
 *   - Police embedded vs outlinée : pareil, complexe. Sinalite remplace
 *     les fonts manquantes par un fallback safe.
 *
 * Output : ValidationResult avec `level` (ok|warning|error) et messages
 * humains en français. L'UI affiche les messages, autorise "proceed with
 * warnings" mais bloque les errors hard.
 */

import { PDFDocument } from 'pdf-lib';

export type ValidationLevel = 'ok' | 'warning' | 'error';

export interface ValidationIssue {
  level: ValidationLevel;
  /** Court ID machine-lisible pour analytics : 'page-count', 'dimensions-mismatch', etc. */
  code: string;
  /** Message humain en français, sous forme de phrase complète. */
  message: string;
  /** Détails techniques optionnels (montrés en "voir détails"). */
  detail?: string;
}

export interface ValidationResult {
  /** Pire niveau parmi les issues. 'ok' si pas d'issues. */
  level: ValidationLevel;
  issues: ValidationIssue[];
  /** Métadonnées extraites du PDF — utile pour debug + storage. */
  meta: {
    pageCount: number;
    /** Dimensions 1ère page en points PDF (1pt = 1/72 inch). */
    firstPagePts: { width: number; height: number };
    /** Dimensions 1ère page converties en pouces (arrondis à 2 déc). */
    firstPageInches: { width: number; height: number };
    /** Dimensions 1ère page converties en mm (arrondis à 1 déc). */
    firstPageMm: { width: number; height: number };
    /** File size in bytes. */
    sizeBytes: number;
  } | null;
}

export interface ExpectedDimensions {
  /** Largeur attendue en pouces, AVANT bleed. */
  widthInches: number;
  /** Hauteur attendue en pouces, AVANT bleed. */
  heightInches: number;
  /** Bleed par côté en pouces (typiquement 0.125 = 1/8"). Default 0.125. */
  bleedInches?: number;
  /** Tolérance d'écart en pouces (default 0.05" = 1.27mm). */
  toleranceInches?: number;
}

export interface ValidationOptions {
  /** Min pages attendues. Default 1. */
  minPages?: number;
  /** Max pages attendues. Default 2 (recto-verso). */
  maxPages?: number;
  /** Dimensions attendues. Si absent, on accepte 0.5"–30". */
  expected?: ExpectedDimensions;
  /** Limite taille en bytes. Default 150 MB — aligné avec MAX_FILE_SIZE_BYTES
   *  côté S3 (storage/s3.ts). Avant : 50 MB, qui bloquait à tort des PDFs que
   *  S3 acceptait (et qu'un PSD du même poids passait, lui, sans validation). */
  maxBytes?: number;
}

const DEFAULTS: Required<Omit<ValidationOptions, 'expected'>> = {
  minPages: 1,
  maxPages: 2,
  // Round 45 #3 — relevé de 50→150 MB pour réaligner sur la limite S3 réelle.
  maxBytes: 150 * 1024 * 1024,
};

const PT_PER_INCH = 72;
const MM_PER_INCH = 25.4;

/**
 * Valide un PDF côté client. Le caller a déjà filtré que le MIME est
 * application/pdf — si ce n'est pas un PDF (PSD, AI, JPG), on skip la
 * validation et on retourne ok (Sinalite va gérer).
 *
 * @throws never. Toute erreur de parse → ValidationIssue avec level=error.
 */
export async function validatePdf(
  file: File,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  const opts = { ...DEFAULTS, ...options };
  const issues: ValidationIssue[] = [];

  // 1. Taille
  if (file.size > opts.maxBytes) {
    issues.push({
      level: 'error',
      code: 'file-too-large',
      message: `Fichier trop volumineux (${formatMb(file.size)}). Maximum : ${formatMb(opts.maxBytes)}.`,
    });
    return { level: 'error', issues, meta: null };
  }

  if (file.size < 100) {
    issues.push({
      level: 'error',
      code: 'file-too-small',
      message: 'Fichier trop petit pour être un PDF valide.',
    });
    return { level: 'error', issues, meta: null };
  }

  // 2. Parse
  let pdfDoc: PDFDocument;
  try {
    const bytes = await file.arrayBuffer();
    pdfDoc = await PDFDocument.load(bytes, {
      // ignoreEncryption=false fait planter sur les PDFs protégés. On veut
      // permettre l'utilisateur de comprendre pourquoi ça bloque.
      ignoreEncryption: false,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'erreur parse';
    if (/encrypt/i.test(msg)) {
      issues.push({
        level: 'error',
        code: 'pdf-encrypted',
        message: 'PDF protégé par mot de passe. Retire la protection et réessaie.',
        detail: msg,
      });
    } else {
      issues.push({
        level: 'error',
        code: 'pdf-invalid',
        message: 'Impossible de lire ce PDF. Le fichier semble corrompu ou n\'est pas un vrai PDF.',
        detail: msg,
      });
    }
    return { level: 'error', issues, meta: null };
  }

  // 3. Page count
  const pageCount = pdfDoc.getPageCount();
  if (pageCount < opts.minPages) {
    issues.push({
      level: 'error',
      code: 'too-few-pages',
      message: `Ce PDF a ${pageCount} page${pageCount > 1 ? 's' : ''}. Minimum attendu : ${opts.minPages}.`,
    });
  } else if (pageCount > opts.maxPages) {
    issues.push({
      level: 'warning',
      code: 'too-many-pages',
      message: `Ce PDF a ${pageCount} pages. Seulement les ${opts.maxPages === 1 ? '1ère' : `${opts.maxPages} premières`} seront imprimées.`,
    });
  }

  // 4. Dimensions 1ère page
  const firstPage = pdfDoc.getPage(0);
  const { width: wPts, height: hPts } = firstPage.getSize();
  const wInches = wPts / PT_PER_INCH;
  const hInches = hPts / PT_PER_INCH;
  const wMm = wInches * MM_PER_INCH;
  const hMm = hInches * MM_PER_INCH;

  if (opts.expected) {
    const tolerance = opts.expected.toleranceInches ?? 0.05;
    const bleed = opts.expected.bleedInches ?? 0.125;
    // Dimensions attendues = product size + bleed sur chaque côté
    const targetW = opts.expected.widthInches + bleed * 2;
    const targetH = opts.expected.heightInches + bleed * 2;
    // On accepte aussi l'orientation inversée (paysage vs portrait)
    const matchesNormal = Math.abs(wInches - targetW) <= tolerance && Math.abs(hInches - targetH) <= tolerance;
    const matchesRotated = Math.abs(wInches - targetH) <= tolerance && Math.abs(hInches - targetW) <= tolerance;
    if (!matchesNormal && !matchesRotated) {
      // Check si l'utilisateur a oublié le bleed (dimensions = product size pile)
      const matchesNoBleed = Math.abs(wInches - opts.expected.widthInches) <= tolerance && Math.abs(hInches - opts.expected.heightInches) <= tolerance;
      if (matchesNoBleed) {
        issues.push({
          level: 'warning',
          code: 'bleed-missing',
          message: `Dimensions du PDF (${wInches.toFixed(2)}" × ${hInches.toFixed(2)}") correspondent au format final sans bleed. Pour un bord parfait, ajoute ${bleed}" de bleed sur chaque côté (= ${targetW.toFixed(2)}" × ${targetH.toFixed(2)}").`,
        });
      } else {
        issues.push({
          level: 'warning',
          code: 'dimensions-mismatch',
          message: `Dimensions inattendues : ${wInches.toFixed(2)}" × ${hInches.toFixed(2)}" (${wMm.toFixed(0)}mm × ${hMm.toFixed(0)}mm). Attendu : ${targetW.toFixed(2)}" × ${targetH.toFixed(2)}" (avec ${bleed}" de bleed). Risque de marges blanches ou de découpe imprécise.`,
        });
      }
    }
  } else {
    // Pas de dimensions attendues — on check juste que c'est dans une fourchette raisonnable
    if (wInches < 0.5 || hInches < 0.5) {
      // Round 45 #3 — warning (override) au lieu de error (hard block). Un
      // produit légitimement petit (mini-étiquette, sticker die-cut) ou une
      // taille mal lue par pdf-lib ne doit pas bloquer l'upload : on alerte,
      // l'utilisateur confirme s'il sait ce qu'il fait. Les vrais hard-blocks
      // (illisible, chiffré, trop gros) restent en error.
      issues.push({
        level: 'warning',
        code: 'dimensions-too-small',
        message: `Dimensions très petites : ${wInches.toFixed(2)}" × ${hInches.toFixed(2)}". Vérifie l'export de ton fichier — sauf si c'est intentionnel (petit format).`,
      });
    } else if (wInches > 30 || hInches > 30) {
      issues.push({
        level: 'warning',
        code: 'dimensions-very-large',
        message: `Dimensions très grandes : ${wInches.toFixed(2)}" × ${hInches.toFixed(2)}". Vérifie que c'est intentionnel.`,
      });
    }
  }

  const meta = {
    pageCount,
    firstPagePts: { width: round(wPts, 2), height: round(hPts, 2) },
    firstPageInches: { width: round(wInches, 2), height: round(hInches, 2) },
    firstPageMm: { width: round(wMm, 1), height: round(hMm, 1) },
    sizeBytes: file.size,
  };

  const level: ValidationLevel = issues.some((i) => i.level === 'error')
    ? 'error'
    : issues.some((i) => i.level === 'warning')
      ? 'warning'
      : 'ok';

  return { level, issues, meta };
}

/**
 * Helper pour décider si un MIME nécessite la validation PDF. Les autres
 * formats (PSD, AI, JPG, PNG, TIFF) sont passés à Sinalite tels quels.
 */
export function isPdfMime(contentType: string): boolean {
  return contentType === 'application/pdf' || contentType.toLowerCase().endsWith('/pdf');
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function round(n: number, decimals: number): number {
  const k = Math.pow(10, decimals);
  return Math.round(n * k) / k;
}
