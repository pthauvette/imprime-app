/**
 * MCP tools — `get_product_options` + `get_print_quote`.
 *
 * Le cœur de valeur du MCP : « combien pour 500 cartes 14pt mates ? ».
 *
 * Correctness : le prix réutilise `lookupVariant()` — LA MÊME fonction canonique
 * que le checkout (`/api/orders/create`) — donc le devis MCP == le prix payé. On
 * réutilise aussi `getEnrichedVariantIndex()` (markup admin déjà appliqué) et
 * `resolveVirtualProductId()` (papier+finition → productId Sinalite distinct ;
 * ils NE sont PAS dans la clé de prix, ils SONT le produit).
 *
 * Les helpers de sélection d'options sont PURS (testés en unitaire) ; seule
 * l'orchestration touche Sinalite (live) + Prisma (markup, gracieux si down).
 */
import {
  getVirtualProduct,
  virtualPapers,
  virtualFinishes,
  resolveVirtualProductId,
} from '@/lib/products/virtual-products';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { lookupVariant } from '@/lib/sinalite/pricing';
import { sinalite } from '@/lib/sinalite/client';
import type { SinaliteOption } from '@/lib/sinalite/types';

// ── Helpers PURS (testables sans I/O) ───────────────────────────────────────

/** Groupe les options Sinalite par `group`, en filtrant celles masquées par l'admin. */
export function groupVisibleOptions(
  options: readonly SinaliteOption[],
  hiddenOptionIds: ReadonlySet<number>,
): Record<string, SinaliteOption[]> {
  const groups: Record<string, SinaliteOption[]> = {};
  for (const opt of options) {
    if (hiddenOptionIds.has(opt.id)) continue;
    (groups[opt.group] ??= []).push(opt);
  }
  return groups;
}

/** Quantités disponibles (valeurs numériques triées) à partir du groupe 'qty'. */
export function availableQuantities(
  optionGroups: Record<string, SinaliteOption[]>,
): number[] {
  return (optionGroups['qty'] ?? [])
    .map((o) => Number(o.name))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
}

export type QuoteSelection =
  | { ok: true; optionIds: number[] }
  | { ok: false; error: string; availableQuantities: number[] };

/**
 * Reproduit la sélection du wizard pour une quantité donnée :
 *   - chaque groupe NON-qty → sa 1re option (le défaut wizard) ;
 *   - + l'option qty qui matche `quantityValue`.
 * Retourne les optionIds à passer à `lookupVariant` (qui re-canonicalise/trie).
 */
export function selectQuoteOptionIds(
  optionGroups: Record<string, SinaliteOption[]>,
  quantityValue: number,
): QuoteSelection {
  const nonQtyIds: number[] = [];
  for (const [group, opts] of Object.entries(optionGroups)) {
    if (group === 'qty') continue;
    if (opts.length > 0) nonQtyIds.push(opts[0].id);
  }
  const qtyOpts = optionGroups['qty'] ?? [];
  const qtyOpt = qtyOpts.find((o) => Number(o.name) === quantityValue);
  if (!qtyOpt) {
    return { ok: false, error: 'quantity_unavailable', availableQuantities: availableQuantities(optionGroups) };
  }
  return { ok: true, optionIds: [...nonQtyIds, qtyOpt.id] };
}

// ── Orchestration (I/O : Sinalite live + Prisma markup) ──────────────────────

export interface ProductOptionsResult {
  slug: string;
  name: string;
  papers: Array<{ key: string; label: string; description: string; finishes: Array<{ key: string; label: string }> }>;
  /** Quantités typiques (d'un produit représentatif). Vide si Sinalite indisponible. */
  quantities: number[];
}

/** Options d'un produit virtuel : papiers → finitions (registre) + quantités (live). */
export async function getProductOptions(slug: string): Promise<ProductOptionsResult | null> {
  const vp = getVirtualProduct(slug);
  if (!vp) return null;

  const papers = virtualPapers(slug).map((paper) => ({
    key: paper.key,
    label: paper.label,
    description: paper.desc,
    finishes: virtualFinishes(slug, paper.key).map((v) => ({ key: v.finish, label: v.finishLabel })),
  }));

  // Quantités : depuis un produit représentatif (1er papier × 1re finition).
  let quantities: number[] = [];
  const firstPaper = papers[0];
  const firstFinish = firstPaper?.finishes[0];
  if (firstPaper && firstFinish) {
    const productId = resolveVirtualProductId(slug, firstPaper.key, firstFinish.key);
    if (productId !== null) {
      try {
        const [detail, enriched] = await Promise.all([
          sinalite.getProductDetail(productId),
          getEnrichedVariantIndex(productId),
        ]);
        quantities = availableQuantities(groupVisibleOptions(detail.options, enriched.hiddenOptionIds));
      } catch {
        // Sinalite/Prisma down → on retourne au moins papiers/finitions.
        quantities = [];
      }
    }
  }

  return { slug, name: vp.name, papers, quantities };
}

export type QuoteResult =
  | { ok: true; productId: number; quantity: number; totalCad: number; unitPriceCad: number }
  | { ok: false; reason: 'unknown_product' | 'invalid_combo' | 'quantity_unavailable' | 'price_unavailable'; message: string; availableQuantities?: number[] };

/**
 * Devis pour (slug, papier, finition, quantité). Prix CAD total (markup inclus),
 * via la MÊME fonction `lookupVariant` que le checkout → devis == prix payé.
 */
export async function getPrintQuote(
  slug: string,
  paperKey: string,
  finishKey: string,
  quantityValue: number,
): Promise<QuoteResult> {
  if (!getVirtualProduct(slug)) {
    return { ok: false, reason: 'unknown_product', message: `Produit inconnu : ${slug}. Utilise list_print_products.` };
  }
  const productId = resolveVirtualProductId(slug, paperKey, finishKey);
  if (productId === null) {
    return { ok: false, reason: 'invalid_combo', message: `Combinaison papier/finition invalide (${paperKey}/${finishKey}). Utilise get_product_options.` };
  }

  const [detail, enriched] = await Promise.all([
    sinalite.getProductDetail(productId),
    getEnrichedVariantIndex(productId),
  ]);
  const optionGroups = groupVisibleOptions(detail.options, enriched.hiddenOptionIds);

  const sel = selectQuoteOptionIds(optionGroups, quantityValue);
  if (!sel.ok) {
    return {
      ok: false,
      reason: 'quantity_unavailable',
      message: `Quantité ${quantityValue} indisponible pour ce produit.`,
      availableQuantities: sel.availableQuantities,
    };
  }

  const total = lookupVariant(sel.optionIds, enriched.index);
  if (total === null) {
    return { ok: false, reason: 'price_unavailable', message: 'Prix indisponible pour cette combinaison.' };
  }

  return {
    ok: true,
    productId,
    quantity: quantityValue,
    totalCad: Math.round(total * 100) / 100,
    unitPriceCad: Math.round((total / quantityValue) * 10000) / 10000,
  };
}

// ── Formatage texte (content du tool) ────────────────────────────────────────

export function formatProductOptionsText(r: ProductOptionsResult): string {
  const lines = [`# ${r.name} (slug: ${r.slug})`, ''];
  for (const p of r.papers) {
    const finishes = p.finishes.map((f) => `\`${f.key}\` (${f.label})`).join(', ') || '—';
    lines.push(`- Papier \`${p.key}\` — ${p.label}. Finitions : ${finishes}`);
  }
  if (r.quantities.length) {
    lines.push('', `**Quantités disponibles :** ${r.quantities.join(', ')}`);
  }
  lines.push('', 'Pour un prix : `get_print_quote` avec slug + paper + finish + quantity.');
  return lines.join('\n');
}

export function formatQuoteText(slug: string, paper: string, finish: string, r: QuoteResult): string {
  if (!r.ok) {
    let msg = r.message;
    if (r.availableQuantities?.length) msg += `\nQuantités disponibles : ${r.availableQuantities.join(', ')}`;
    return `❌ ${msg}`;
  }
  return [
    `Devis Plio — ${slug} · papier ${paper} · finition ${finish} · ${r.quantity} unités`,
    ``,
    `**Total : ${r.totalCad.toFixed(2)} $ CAD** (${r.unitPriceCad.toFixed(4)} $/unité)`,
    `_Taxes en sus. Livraison estimée séparément. Prix valable sous réserve de disponibilité Sinalite._`,
  ].join('\n');
}
