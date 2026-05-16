/**
 * Registry de tous les templates disponibles. Pour MVP on hardcode ici
 * (pas en DB) — plus simple à itérer en dev. Migration vers DB quand on
 * voudra une UI admin pour CRUD les templates.
 */

import type { AppTemplate, ProductType } from './types';
import { BC_MINIMAL_BW, BC_ACCENT_BLOCK, BC_EDITORIAL } from './business-cards';

export const ALL_TEMPLATES: AppTemplate[] = [
  BC_MINIMAL_BW,
  BC_ACCENT_BLOCK,
  BC_EDITORIAL,
];

const BY_SLUG = new Map(ALL_TEMPLATES.map((t) => [t.slug, t] as const));

export function getTemplateBySlug(slug: string): AppTemplate | null {
  return BY_SLUG.get(slug) ?? null;
}

export function listTemplates(filter?: { productType?: ProductType; tags?: string[] }): AppTemplate[] {
  let result = ALL_TEMPLATES;
  if (filter?.productType) {
    result = result.filter((t) => t.productType === filter.productType);
  }
  if (filter?.tags && filter.tags.length > 0) {
    const want = new Set(filter.tags);
    result = result.filter((t) => t.tags.some((tag) => want.has(tag)));
  }
  return result;
}

export function listProductTypes(): { type: ProductType; count: number; label: string }[] {
  const counts = new Map<ProductType, number>();
  for (const t of ALL_TEMPLATES) {
    counts.set(t.productType, (counts.get(t.productType) ?? 0) + 1);
  }
  const labels: Record<ProductType, string> = {
    BUSINESS_CARD: 'Cartes de visite',
    FLYER: 'Flyers',
    POSTCARD: 'Cartes postales',
    BROCHURE: 'Brochures',
  };
  return Array.from(counts.entries()).map(([type, count]) => ({
    type,
    count,
    label: labels[type],
  }));
}
