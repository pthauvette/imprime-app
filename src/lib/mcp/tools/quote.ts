/**
 * MCP tools — `get_product_options` + `get_print_quote`.
 *
 * Le cœur de valeur du MCP : « combien pour 500 cartes 14pt mates ? ».
 *
 * Correctness : le prix passe par `resolveVariantPrice()` — index local PUIS
 * repli distant, exactement comme le checkout (`price-order.ts`) — donc le devis
 * MCP == le prix payé. Réutiliser `lookupVariant()` SEUL ne suffisait pas : le
 * checkout, lui, replie, si bien que le MCP refusait de coter des produits que
 * Plio facture (bug 2026-08, cf. resolve-price.ts). On réutilise aussi
 * `getEnrichedVariantIndex()` (markup admin déjà appliqué) et
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
import { resolveVariantPrice } from '@/lib/products/resolve-price';
import { isSidednessGroup, classifySidedness } from '@/lib/products/sidedness';
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

/**
 * Groupes dont l'admin a masqué TOUTES les options.
 *
 * `groupVisibleOptions` les fait disparaître entièrement — et un groupe absent
 * ne produit aucun optionId. La combinaison sort donc INCOMPLÈTE : l'index la
 * rate forcément, le repli distant la fait quand même chiffrer par Sinalite, et
 * `create_order` en fabrique un lien de finalisation. Plio cotait alors une
 * configuration à laquelle l'admin avait retiré un groupe entier, puis
 * transmettait à la production un `productOptions` amputé. Le prix restait
 * cohérent devis↔facturé — donc rien ne clignotait — mais la garde admin était
 * franchie. On refuse en amont plutôt que de deviner ce qui manque.
 */
export function fullyHiddenGroups(
  options: readonly SinaliteOption[],
  hiddenOptionIds: ReadonlySet<number>,
): string[] {
  const total = new Map<string, number>();
  const hidden = new Map<string, number>();
  for (const opt of options) {
    total.set(opt.group, (total.get(opt.group) ?? 0) + 1);
    if (hiddenOptionIds.has(opt.id)) hidden.set(opt.group, (hidden.get(opt.group) ?? 0) + 1);
  }
  return [...total.entries()]
    .filter(([group, n]) => (hidden.get(group) ?? 0) === n)
    .map(([group]) => group);
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
 *   - chaque groupe NON-qty → sa 1re option, SAUF le groupe `Stock` quand il
 *     encode en réalité recto/recto-verso → on biaise vers le recto-verso ;
 *   - + l'option qty qui matche `quantityValue`.
 * Retourne les optionIds à passer au calcul de prix (qui re-canonicalise/trie).
 *
 * ⚠️ Le biais recto-verso n'est pas cosmétique. Le wizard l'applique depuis
 * 2026-07 (finding [10] : « un client qui a conçu un recto-verso payait une
 * impression recto »), mais le MCP était resté sur « la 1re option » — le
 * commentaire d'origine affirmait que c'était le défaut wizard, ce qui avait
 * cessé d'être vrai. Sur un flyer, l'écart est réel : 50,20 $ en recto contre
 * 67,40 $ en recto-verso pour 500 unités. Un agent aurait annoncé le prix le
 * plus bas, pour un imprimé qu'on suppose imprimé des deux côtés.
 */
export function selectQuoteOptionIds(
  optionGroups: Record<string, SinaliteOption[]>,
  quantityValue: number,
): QuoteSelection {
  const nonQtyIds: number[] = [];
  for (const [group, opts] of Object.entries(optionGroups)) {
    if (group === 'qty') continue;
    if (opts.length === 0) continue;
    const rectoVerso =
      group === 'Stock' && isSidednessGroup(opts.map((o) => o.name))
        ? opts.find((o) => classifySidedness(o.name) === 'double')
        : undefined;
    nonQtyIds.push((rectoVerso ?? opts[0]).id);
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
  /** Quantités de la variante décrite par `quantitiesFor`. Vide si Sinalite indisponible. */
  quantities: number[];
  /**
   * Variante d'où viennent `quantities`, et si elle a été DEMANDÉE ou choisie
   * par défaut. Sans ça, l'appelant ne peut pas savoir que la liste ne vaut
   * peut-être pas pour la combinaison qui l'intéresse.
   */
  quantitiesFor: { paper: string; finish: string; demandee: boolean } | null;
}

/**
 * Options d'un produit virtuel : papiers → finitions (registre) + quantités (live).
 *
 * ⚠️ LES QUANTITÉS DÉPENDENT DE LA VARIANTE, ce que cet outil laissait croire
 * l'inverse. Il renvoyait toujours les paliers d'un produit REPRÉSENTATIF (1er
 * papier × 1re finition) sous le titre « Quantités disponibles », sans dire de
 * quelle variante ils venaient. Mesuré sur le catalogue réel (2026-08) :
 *   • flyers 100lb/standard → 30 paliers ; flyers **linen → 6** ;
 *   • toutes les finitions « matte » perdent les 3 plus petits paliers (25/50/75).
 * Un agent lisait donc 30 quantités et pouvait en demander une qui n'existe pas
 * pour le papier visé — `get_print_quote` répondait « quantité indisponible »
 * sur une valeur que l'outil venait lui-même d'annoncer.
 *
 * `paperKey`/`finishKey` donnent la réponse EXACTE. Sans eux, on garde un seul
 * appel (l'endpoint est public) mais on nomme la variante et on prévient.
 */
export async function getProductOptions(
  slug: string,
  paperKey?: string,
  finishKey?: string,
): Promise<ProductOptionsResult | null> {
  const vp = getVirtualProduct(slug);
  if (!vp) return null;

  const papers = virtualPapers(slug).map((paper) => ({
    key: paper.key,
    label: paper.label,
    description: paper.desc,
    finishes: virtualFinishes(slug, paper.key).map((v) => ({ key: v.finish, label: v.finishLabel })),
  }));

  // Variante visée : celle demandée si elle existe, sinon la représentative.
  const paperDemande = paperKey ? papers.find((p) => p.key === paperKey) : undefined;
  const paperRetenu = paperDemande ?? papers[0];
  const finishDemande = finishKey ? paperRetenu?.finishes.find((f) => f.key === finishKey) : undefined;
  const finishRetenu = finishDemande ?? paperRetenu?.finishes[0];
  const demandee = Boolean(paperDemande && finishDemande);

  let quantities: number[] = [];
  let quantitiesFor: ProductOptionsResult['quantitiesFor'] = null;
  if (paperRetenu && finishRetenu) {
    const productId = resolveVirtualProductId(slug, paperRetenu.key, finishRetenu.key);
    if (productId !== null) {
      quantitiesFor = { paper: paperRetenu.key, finish: finishRetenu.key, demandee };
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

  return { slug, name: vp.name, papers, quantities, quantitiesFor };
}

export type QuoteResult =
  | { ok: true; productId: number; quantity: number; totalCad: number; unitPriceCad: number }
  | {
      ok: false;
      reason: 'unknown_product' | 'invalid_combo' | 'quantity_unavailable' | 'price_unavailable' | 'unavailable';
      message: string;
      availableQuantities?: number[];
    };

/**
 * Devis pour (slug, papier, finition, quantité). Prix CAD total (markup inclus),
 * par la MÊME résolution que le checkout (index + repli) → devis == prix payé.
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

  // Produit masqué par l'admin : on ne cote pas. Ce n'était PAS vérifié ici,
  // et l'oubli coûtait cher — `getEnrichedVariantIndex` renvoie délibérément
  // l'index BRUT (marginPct forcé à null) pour un produit désactivé, en
  // comptant sur l'appelant pour refuser. `create_order` et le checkout
  // refusent ; `get_print_quote` cotait donc les produits cachés AU PRIX
  // COÛTANT — un devis que Plio n'honorerait pas (PRODUCT_DISABLED au
  // checkout), doublé d'une fuite de la base de coûts.
  if (enriched.disabled) {
    return { ok: false, reason: 'unavailable', message: `Produit indisponible : ${slug}.` };
  }

  // Un groupe entièrement masqué rendrait la combinaison incomplète — cf.
  // fullyHiddenGroups. On refuse plutôt que de coter une configuration amputée.
  if (fullyHiddenGroups(detail.options, enriched.hiddenOptionIds).length > 0) {
    return { ok: false, reason: 'unavailable', message: `Produit indisponible : ${slug}.` };
  }

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

  // Index local PUIS repli distant — cf. resolve-price.ts. Sans le repli, ce
  // devis échouait sur des familles entières (flyers, cartes postales) dont
  // l'index ne couvre que les plus petits paliers.
  const total = await resolveVariantPrice(productId, sel.optionIds, enriched);
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
  // Le titre NOMME la variante : « Quantités disponibles » tout court laissait
  // croire qu'elles valaient pour tout le produit, ce qui est faux (linen : 6
  // paliers contre 30 pour 100lb).
  if (r.quantities.length && r.quantitiesFor) {
    const { paper, finish, demandee } = r.quantitiesFor;
    lines.push('', `**Quantités pour \`${paper}\` / \`${finish}\` :** ${r.quantities.join(', ')}`);
    if (!demandee) {
      lines.push(
        '',
        '⚠️ Les quantités varient selon le papier et la finition. Celles ci-dessus sont ' +
          'celles de la variante par défaut. Rappelle `get_product_options` avec `paper` ' +
          'et `finish` pour la liste exacte de la combinaison qui t’intéresse.',
      );
    }
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
