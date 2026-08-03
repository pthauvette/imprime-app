/**
 * MCP tool — `list_print_products`.
 *
 * Façade read-only sur le catalogue CURATÉ (VIRTUAL_PRODUCTS) : les produits
 * d'impression que Plio met en avant (carte de visite, flyer, carte postale…),
 * chacun avec ses papiers. C'est le point d'entrée « découverte » pour un agent
 * IA : zéro I/O, donnée statique infaillible. Le prix LIVE vient des tools quote.
 *
 * Logique séparée du transport HTTP pour être testable en unitaire (comme le
 * reste du repo) — le route handler ne fait qu'appeler + formater.
 */
import { VIRTUAL_PRODUCTS } from '@/lib/products/virtual-products';

export interface McpPaper {
  key: string;
  label: string;
  description: string;
  /** Papier « spécialité » (kraft, perle…) — regroupé après les standards. */
  specialty: boolean;
}

export interface McpProductSummary {
  /** Slug à passer aux autres tools (ex. 'cartes-de-visite'). */
  slug: string;
  name: string;
  description: string;
  papers: McpPaper[];
}

/** Retourne le catalogue curaté de Plio (produits virtuels + papiers). Pur, sans I/O. */
export function listPrintProducts(): McpProductSummary[] {
  return Object.values(VIRTUAL_PRODUCTS).map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.lede,
    papers: p.papers.map((paper) => ({
      key: paper.key,
      label: paper.label,
      description: paper.desc,
      specialty: paper.specialty ?? false,
    })),
  }));
}

/** Rend le catalogue en Markdown lisible pour un agent IA (content texte du tool). */
export function formatProductsText(products: McpProductSummary[]): string {
  const lines: string[] = [
    `Plio — ${products.length} familles de produits d'impression disponibles.`,
    `Pour un devis, utilise \`get_print_quote\` avec le slug + papier + finition + quantité.`,
    '',
  ];
  for (const p of products) {
    lines.push(`### ${p.name}  \`(slug: ${p.slug})\``);
    lines.push(p.description);
    const papers = p.papers
      .map((pp) => `- \`${pp.key}\` — ${pp.label} : ${pp.description}${pp.specialty ? ' _(spécialité)_' : ''}`)
      .join('\n');
    lines.push(`**Papiers :**\n${papers}`, '');
  }
  // Sans cette mention, un agent qui ne trouve pas son produit conclut que Plio
  // ne le fait pas. C'est arrivé (2026-08) : « les 13 familles sont toutes en
  // papier, donc pas de coroplast » — alors que Plio en imprime, par devis.
  // Une lacune du CATALOGUE prise pour une lacune de l'OFFRE.
  lines.push(
    '---',
    'Ces familles sont le libre-service (prix instantané, commande en ligne). Plio ' +
      'imprime AUSSI hors de ce catalogue — substrats rigides (coroplast, foamcore, ' +
      'dibond), grand format, packaging, très gros tirages — servis par devis. ' +
      'Utilise `get_custom_quote_info` avant de conclure qu’un produit est indisponible.',
  );
  return lines.join('\n').trim();
}
