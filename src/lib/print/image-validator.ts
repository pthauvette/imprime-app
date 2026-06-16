/**
 * Validation client-side d'une IMAGE raster (JPG/PNG) avant upload print.
 *
 * Les fichiers raster passaient AVANT sans aucune validation → une image web
 * basse résolution (capture d'écran 72 DPI) était acceptée alors qu'elle sort
 * pixelisée à l'impression. On décode l'image dans le navigateur, on lit ses
 * dimensions en pixels, et on calcule le DPI EFFECTIF à la taille d'impression.
 *
 * Décidable SEULEMENT pour les formats que le navigateur décode (JPG/PNG). Les
 * formats pro non décodables (TIFF/PSD/AI/EPS) → skip (Sinalite reste le gate).
 *
 * Couleur (RGB/CMYK) : non lisible de façon fiable côté client → délégué Sinalite.
 */
export type ImageValidationLevel = 'ok' | 'warning' | 'error';

export interface ImageValidationResult {
  level: ImageValidationLevel;
  issues: { level: ImageValidationLevel; code: string; message: string; detail?: string }[];
  meta: { widthPx: number; heightPx: number; effectiveDpi: number | null } | null;
}

/** < ce DPI à la taille d'impression = clairement une image écran/web → BLOQUE. */
const ERROR_DPI = 100;
/** 100–150 DPI = imprimable mais qualité réduite (idéal 300) → warning. */
const WARN_DPI = 150;
/** Sans taille connue : moins que ça sur un côté = quasi sûrement trop petit. */
const ABS_MIN_PX = 400;

/**
 * Cœur PUR (testable) : décide le niveau à partir des pixels + taille attendue.
 */
export function assessImageResolution(
  widthPx: number,
  heightPx: number,
  expected?: { widthInches: number; heightInches: number },
): ImageValidationResult {
  const issues: ImageValidationResult['issues'] = [];
  let effectiveDpi: number | null = null;

  if (expected && expected.widthInches > 0 && expected.heightInches > 0) {
    // DPI = pixels / pouces, sur la dimension la plus contraignante. On tolère
    // l'orientation inversée (portrait vs paysage) et on garde le meilleur.
    const dpiNormal = Math.min(widthPx / expected.widthInches, heightPx / expected.heightInches);
    const dpiRotated = Math.min(widthPx / expected.heightInches, heightPx / expected.widthInches);
    effectiveDpi = Math.round(Math.max(dpiNormal, dpiRotated));

    if (effectiveDpi < ERROR_DPI) {
      issues.push({
        level: 'error',
        code: 'image-dpi-too-low',
        message: `Résolution trop basse pour l'impression : ~${effectiveDpi} DPI à ${expected.widthInches}" × ${expected.heightInches}". Minimum 100 DPI, idéal 300. Fournis une image plus grande ou un PDF vectoriel.`,
        detail: `${widthPx}×${heightPx}px`,
      });
    } else if (effectiveDpi < WARN_DPI) {
      issues.push({
        level: 'warning',
        code: 'image-dpi-low',
        message: `Résolution faible : ~${effectiveDpi} DPI (idéal 300). L'impression peut paraître légèrement floue. Acceptable si tu sais ce que tu fais.`,
        detail: `${widthPx}×${heightPx}px`,
      });
    }
  } else {
    // Pas de taille connue → garde-fou absolu sur les pixels.
    const minSide = Math.min(widthPx, heightPx);
    if (minSide < ABS_MIN_PX) {
      issues.push({
        level: 'error',
        code: 'image-too-small',
        message: `Image trop petite pour l'impression : ${widthPx}×${heightPx}px. C'est une résolution d'écran, pas d'impression. Fournis une image haute résolution ou un PDF.`,
      });
    }
  }

  const level: ImageValidationLevel = issues.some((i) => i.level === 'error')
    ? 'error'
    : issues.some((i) => i.level === 'warning')
      ? 'warning'
      : 'ok';

  return { level, issues, meta: { widthPx, heightPx, effectiveDpi } };
}

/**
 * Valide une image. Décode via createImageBitmap (JPG/PNG). Non décodable
 * (TIFF/PSD/AI/EPS, ou pas d'API) → { level:'ok' } (Sinalite gère).
 * @throws never.
 */
export async function validateImage(
  file: File,
  expected?: { widthInches: number; heightInches: number },
): Promise<ImageValidationResult> {
  try {
    if (typeof createImageBitmap !== 'function') return { level: 'ok', issues: [], meta: null };
    const bmp = await createImageBitmap(file);
    const widthPx = bmp.width;
    const heightPx = bmp.height;
    bmp.close?.();
    if (!widthPx || !heightPx) return { level: 'ok', issues: [], meta: null };
    return assessImageResolution(widthPx, heightPx, expected);
  } catch {
    // Format non décodable par le navigateur → on ne peut pas valider ici.
    return { level: 'ok', issues: [], meta: null };
  }
}
