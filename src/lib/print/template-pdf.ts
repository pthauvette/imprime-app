/**
 * Génération du gabarit d'impression téléchargeable — finding [22]/[116]/[130].
 *
 * « Toutes les cotes existent déjà en code (margin-specs.ts), pdf-lib est déjà
 * une dépendance serveur, zéro gabarit n'existe nulle part dans le dépôt. »
 * Le PDF généré fait EXACTEMENT la taille exportable (trait de coupe + fond
 * perdu) — un designer peut l'ouvrir dans son logiciel et caler son visuel
 * dessus, ou l'utiliser comme base directement.
 *
 * Repères dessinés : rectangle plein page = zone de fond perdu (bleed), trait
 * noir = coupe finale, trait vert = zone sûre (texte/logos à l'intérieur).
 * Petits traits de coupe (crop marks) aux 4 coins, convention standard
 * impression.
 */

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from 'pdf-lib';

const PT_PER_INCH = 72;
const CROP_MARK_LEN = 14; // points

export interface TemplatePdfInput {
  /** Dimensions de coupe finale (SANS le fond perdu), en pouces. */
  trimWidthIn: number;
  trimHeightIn: number;
  /** Fond perdu par côté, en pouces. 0 = pas de fond perdu (ex: enveloppes). */
  bleedIn: number;
  /** Zone sûre à l'intérieur du trait de coupe, en pouces. 0 = pas de marge affichée. */
  safeIn: number;
  /** Nom du produit, affiché dans l'en-tête. */
  productName?: string;
}

function formatIn(n: number): string {
  return n.toLocaleString('fr-CA', { maximumFractionDigits: 3 });
}

function drawCropMarks(page: PDFPage, trimX: number, trimY: number, trimW: number, trimH: number, color: ReturnType<typeof rgb>) {
  const corners: Array<{ x: number; y: number; dx: number; dy: number }> = [
    { x: trimX, y: trimY, dx: -1, dy: -1 },
    { x: trimX + trimW, y: trimY, dx: 1, dy: -1 },
    { x: trimX, y: trimY + trimH, dx: -1, dy: 1 },
    { x: trimX + trimW, y: trimY + trimH, dx: 1, dy: 1 },
  ];
  for (const c of corners) {
    // Marque horizontale (s'éloigne du coin sur l'axe X)
    page.drawLine({
      start: { x: c.x, y: c.y },
      end: { x: c.x + c.dx * CROP_MARK_LEN, y: c.y },
      thickness: 0.75,
      color,
    });
    // Marque verticale (s'éloigne du coin sur l'axe Y)
    page.drawLine({
      start: { x: c.x, y: c.y },
      end: { x: c.x, y: c.y + c.dy * CROP_MARK_LEN },
      thickness: 0.75,
      color,
    });
  }
}

function drawLegendRow(page: PDFPage, x: number, y: number, swatch: ReturnType<typeof rgb>, label: string, font: PDFFont) {
  page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 18, y: y + 3 }, thickness: 2, color: swatch });
  page.drawText(label, { x: x + 24, y, size: 9, font, color: rgb(0.29, 0.33, 0.3) });
}

/** Génère un gabarit d'impression PDF. Retourne les bytes prêts à streamer. */
export async function generateTemplatePdf(input: TemplatePdfInput): Promise<Uint8Array> {
  const { trimWidthIn, trimHeightIn, bleedIn, safeIn } = input;

  const pageWIn = trimWidthIn + bleedIn * 2;
  const pageHIn = trimHeightIn + bleedIn * 2;
  const pageW = pageWIn * PT_PER_INCH;
  const pageH = pageHIn * PT_PER_INCH;

  const doc = await PDFDocument.create();
  const page = doc.addPage([pageW, pageH]);
  const fontBody = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const hasBleed = bleedIn > 0;
  const colorBleed = rgb(0.94, 0.42, 0.38);
  const colorTrim = rgb(0.08, 0.11, 0.09);
  const colorSafe = rgb(0.12, 0.24, 0.17);

  // Fond perdu = toute la page (teinte légère pour distinguer visuellement
  // de la coupe finale — un fichier livré SANS marge de bleed remplira le
  // trait de coupe pile, sans jamais atteindre le bord de cette zone).
  if (hasBleed) {
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: rgb(0.995, 0.96, 0.955) });
  }

  const trimX = bleedIn * PT_PER_INCH;
  const trimY = bleedIn * PT_PER_INCH;
  const trimW = trimWidthIn * PT_PER_INCH;
  const trimH = trimHeightIn * PT_PER_INCH;

  // Trait de coupe
  page.drawRectangle({
    x: trimX, y: trimY, width: trimW, height: trimH,
    borderColor: colorTrim, borderWidth: 1,
  });
  drawCropMarks(page, trimX, trimY, trimW, trimH, colorTrim);

  // Zone sûre
  if (safeIn > 0) {
    const safePt = safeIn * PT_PER_INCH;
    page.drawRectangle({
      x: trimX + safePt, y: trimY + safePt,
      width: trimW - 2 * safePt, height: trimH - 2 * safePt,
      borderColor: colorSafe, borderWidth: 1,
    });
  }

  // En-tête (dans la zone sûre si possible, sinon en haut de la page)
  const headerY = Math.min(pageH - PT_PER_INCH * 0.35, trimY + trimH - 16);
  const headerX = Math.max(trimX + 8, 8);
  page.drawText(`Gabarit — ${input.productName ?? 'Plio'}`, {
    x: headerX, y: headerY, size: 11, font: fontBold, color: colorTrim,
  });
  page.drawText(
    `Coupe finale : ${formatIn(trimWidthIn)} × ${formatIn(trimHeightIn)} po`,
    { x: headerX, y: headerY - 15, size: 9, font: fontBody, color: rgb(0.29, 0.33, 0.3) },
  );

  // Légende (bas de page, dans la zone de bleed si elle existe)
  const legendY = Math.max(6, trimY - PT_PER_INCH * 0.3);
  let lx = headerX;
  if (hasBleed) {
    drawLegendRow(page, lx, legendY, colorBleed, `Fond perdu (${formatIn(bleedIn)} po/côté)`, fontBody);
    lx += 150;
  }
  drawLegendRow(page, lx, legendY, colorTrim, 'Trait de coupe', fontBody);
  lx += 100;
  if (safeIn > 0) {
    drawLegendRow(page, lx, legendY, colorSafe, `Zone sûre (${formatIn(safeIn)} po)`, fontBody);
  }

  return doc.save();
}
