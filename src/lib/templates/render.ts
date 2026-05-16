/**
 * Génération PDF print-ready via pdfme.
 *
 * pdfme produit du PDF/1.7. Pour Sinalite (qui veut CMYK + bleed) ça suffit
 * comme baseline ; un pass post-process colorspace pourra être ajouté plus
 * tard (Ghostscript ou api.printify equivalent).
 *
 * On enregistre Roboto comme font par défaut — c'est la font livrée avec
 * @pdfme/common (base64 inline) et le fallback de toutes les templates.
 */

import { generate } from '@pdfme/generator';
import { text, line, rectangle, ellipse, image, table, svg } from '@pdfme/schemas';
import { getDefaultFont } from '@pdfme/common';
import type { AppTemplate } from './types';

const PLUGINS = { text, line, rectangle, ellipse, image, table, svg };

// getDefaultFont() retourne { Roboto: { data: <base64>, fallback: true } }
const FONT_OPTIONS = getDefaultFont();

export async function renderTemplateToPdf(
  template: AppTemplate,
  values: Record<string, string>,
): Promise<Uint8Array> {
  const inputs = [filterValuesForTemplate(template, values)];

  return generate({
    template: template.pdfme,
    inputs,
    plugins: PLUGINS,
    options: { font: FONT_OPTIONS },
  });
}

function filterValuesForTemplate(
  template: AppTemplate,
  values: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const page of template.pdfme.schemas) {
    for (const field of page) {
      if (field.readOnly) continue;
      out[field.name] = values[field.name] ?? template.sampleValues[field.name] ?? '';
    }
  }
  return out;
}
