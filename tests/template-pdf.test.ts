/**
 * Tests pour generateTemplatePdf — finding [22]/[116]/[130], gabarit
 * d'impression téléchargeable.
 *
 * On vérifie que :
 *   - Le PDF généré est parseable (round-trip via pdf-lib.load)
 *   - La page fait EXACTEMENT la taille exportable (trim + bleed×2)
 *   - Une taille SANS bleed (ex: enveloppes) donne une page = trim pile
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateTemplatePdf } from '@/lib/print/template-pdf';

const PT_PER_INCH = 72;

describe('generateTemplatePdf', () => {
  it('génère un PDF valide qui se parse round-trip, 1 page', async () => {
    const bytes = await generateTemplatePdf({
      trimWidthIn: 3.5, trimHeightIn: 2, bleedIn: 0.125, safeIn: 0.125,
      productName: 'Cartes professionnelles',
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(300);

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('taille de page = trim + bleed×2 (la taille EXACTE à exporter)', async () => {
    const bytes = await generateTemplatePdf({
      trimWidthIn: 3.5, trimHeightIn: 2, bleedIn: 0.125, safeIn: 0.125,
    });
    const reloaded = await PDFDocument.load(bytes);
    const { width, height } = reloaded.getPage(0).getSize();
    expect(width).toBeCloseTo((3.5 + 0.25) * PT_PER_INCH, 1);
    expect(height).toBeCloseTo((2 + 0.25) * PT_PER_INCH, 1);
  });

  it('bleed=0 (enveloppes) → page = trim pile, pas de zone de fond perdu', async () => {
    const bytes = await generateTemplatePdf({
      trimWidthIn: 9.5, trimHeightIn: 4.125, bleedIn: 0, safeIn: 0.25,
    });
    const reloaded = await PDFDocument.load(bytes);
    const { width, height } = reloaded.getPage(0).getSize();
    expect(width).toBeCloseTo(9.5 * PT_PER_INCH, 1);
    expect(height).toBeCloseTo(4.125 * PT_PER_INCH, 1);
  });

  it('safe=0 → ne throw pas (pas de rectangle sûr dessiné, mais PDF valide)', async () => {
    const bytes = await generateTemplatePdf({
      trimWidthIn: 4, trimHeightIn: 6, bleedIn: 0.125, safeIn: 0,
    });
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('grand format (bannière 36×24) → PDF valide, page proportionnelle', async () => {
    const bytes = await generateTemplatePdf({
      trimWidthIn: 36, trimHeightIn: 24, bleedIn: 0.5, safeIn: 0.5,
    });
    const reloaded = await PDFDocument.load(bytes);
    const { width, height } = reloaded.getPage(0).getSize();
    expect(width).toBeCloseTo(37 * PT_PER_INCH, 1);
    expect(height).toBeCloseTo(25 * PT_PER_INCH, 1);
  });
});
