/**
 * Types pour le système de templates.
 *
 * Un Template = config pdfme (basePdf + schemas) + métadonnées produit.
 * Un user "applique" un template en remplissant les `inputs` (valeurs par
 * field name) → on génère le PDF print-ready côté serveur via pdfme.generate.
 */

import type { Template as PdfmeTemplate } from '@pdfme/common';

export type ProductType = 'BUSINESS_CARD' | 'FLYER' | 'POSTCARD' | 'BROCHURE';
export type Side = 'FRONT' | 'BACK' | 'BOTH';

export interface AppTemplate {
  /** Slug unique pour l'URL : /design/[slug] */
  slug: string;
  name: string;
  description: string;
  productType: ProductType;
  /** Dimensions canoniques: "3.5x2", "8.5x11", etc. */
  variant: string;
  side: Side;
  /** Tags pour le filtrage gallery */
  tags: string[];
  /** Couleur dominante pour le placeholder de thumbnail */
  accentColor: string;
  /** Sample values pour générer la preview + pré-remplir le form */
  sampleValues: Record<string, string>;
  /** Le template pdfme (basePdf + schemas) */
  pdfme: PdfmeTemplate;
  /**
   * Default mapping vers le wizard de commande. Pour business cards on cible
   * "Business cards 14pt Profit Maximizer" (ID 1) — entry-level standard.
   * Le user reste libre de switcher de produit/options dans /order/configure.
   */
  defaultSinalite: {
    productId: number;
  };
}

/**
 * Conversion px ↔ mm pour aider à designer en pensant pixels.
 * pdfme attend toutes les positions en mm.
 */
export const mm = (n: number) => n;
export const inch = (n: number) => n * 25.4;
