/**
 * MCP tool — `configure_print` : la BRIQUE DONNÉES du widget « configurateur ».
 *
 * Renvoie, en JSON, tout ce que le widget affiche : la liste des produits, les
 * papiers/finitions/quantités du produit choisi, LES GROUPES D'OPTIONS multi-choix
 * (faces recto/recto-verso, coins, délai…) et le devis live de la combinaison
 * EXACTE. Le widget rappelle ce tool à chaque changement.
 *
 * Correctness : réutilise resolveVirtualProductId + getEnrichedVariantIndex +
 * lookupVariant (= mêmes prix que le checkout). Présentation SEULEMENT : aucune
 * écriture, aucun invariant money-critical. « Commander » passe par sendMessage →
 * create_order Mode A.
 *
 * Défaut INTELLIGENT : le 1er-de-chaque-groupe n'est pas toujours un combo chiffré
 * (ex. enviro : « Next Business Day » non tarifé) → on balaye les combinaisons des
 * groupes non choisis pour trouver un prix, sinon on retombe sur le 1er (prix null).
 */
import { listPrintProducts } from './list-products';
import { groupVisibleOptions, availableQuantities, fullyHiddenGroups } from './quote';
import {
  getVirtualProduct,
  virtualPapers,
  virtualFinishes,
  resolveVirtualProductId,
} from '@/lib/products/virtual-products';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { lookupVariant } from '@/lib/sinalite/pricing';
import { resolveVariantPrice } from '@/lib/products/resolve-price';
import { isSidednessGroup, classifySidedness } from '@/lib/products/sidedness';
import { sinalite } from '@/lib/sinalite/client';
import type { SinaliteOption } from '@/lib/sinalite/types';

export type ConfiguratorQuote =
  | { ok: true; totalCad: number; unitPriceCad: number; quantity: number }
  | { ok: false; message: string };

export interface ConfiguratorOptionGroup {
  /** Clé Sinalite du groupe (ex. 'Stock', 'Round Corners'). */
  key: string;
  /** Libellé FR (ex. 'Faces', 'Coins', 'Délai'). */
  label: string;
  options: Array<{ id: number; label: string }>;
  /** Option actuellement sélectionnée. */
  selectedId: number;
}

export interface ConfiguratorPayload {
  products: Array<{ slug: string; name: string }>;
  selected: {
    slug: string;
    name: string;
    papers: Array<{ key: string; label: string; description: string; finishes: Array<{ key: string; label: string }> }>;
    quantities: number[];
  } | null;
  /** Groupes d'options multi-choix à présenter (faces, coins, délai…). */
  optionGroups: ConfiguratorOptionGroup[];
  selection: { slug: string; paper: string | null; finish: string | null; quantity: number | null; options: number[] } | null;
  quote: ConfiguratorQuote | null;
}

export interface ConfiguratorInput {
  slug?: string;
  paper?: string;
  finish?: string;
  quantity?: number;
  /** IDs des options NON-qty choisies (une par groupe ; le reste = défaut). */
  options?: number[];
}

const PREFERRED_DEFAULT_QTY = 500;
/** Groupes qu'on NE présente PAS comme choix (gérés ailleurs ou figés). */
const NEVER_SELECTABLE = new Set(['qty']);

/** Libellé FR d'un groupe Sinalite (fallback = nom brut). */
function groupLabel(key: string): string {
  const m: Record<string, string> = { Stock: 'Faces', 'Round Corners': 'Coins', Turnaround: 'Délai', size: 'Format' };
  return m[key] ?? key;
}

/** Libellé FR d'une option (fallback = nom nettoyé). */
function optionLabel(group: string, name: string): string {
  const n = name.toLowerCase();
  if (group === 'Stock') {
    if (n.includes('2 side') || n.includes('4/4')) return 'Recto-verso (2 faces)';
    if (n.includes('1 side') || n.includes('4/0')) return 'Recto (1 face)';
  }
  if (group === 'Round Corners') {
    if (n === 'no') return 'Carrés';
    if (n === 'yes') return 'Coins arrondis';
  }
  if (group === 'Turnaround') {
    if (n.includes('next')) return '1 jour ouvrable';
    if (n.includes('2 - 3') || n.includes('2-3')) return '2–3 jours ouvrables';
  }
  return name;
}

/** Produit cartésien borné (anti-explosion). */
function cartesian<T>(arrays: T[][], cap = 256): T[][] {
  let out: T[][] = [[]];
  for (const arr of arrays) {
    const next: T[][] = [];
    for (const combo of out) for (const item of arr) { next.push([...combo, item]); if (next.length > cap) return next; }
    out = next;
  }
  return out;
}

/**
 * Résout la sélection d'options + le devis. Groupes choisis par l'user (via
 * `selectedOptions`) = FIXÉS ; groupes libres = défaut intelligent (1er si chiffré,
 * sinon balayage des combos pour trouver un prix).
 *
 * ⚠️ EXCEPTION RECTO-VERSO. Le groupe `Stock` encode parfois les faces plutôt
 * que le papier ; dans ce cas il est FIXÉ au recto-verso comme le wizard web
 * (cf. `order/configure/page.tsx`), et retiré du balayage. Sans ça, le balayage
 * retenait le premier combo chiffré — donc le RECTO — pendant que
 * `get_print_quote` et `create_order` cotaient le recto-verso : le widget
 * affichait « Recto · 50,20 $ », l'utilisateur cliquait « Commander », et
 * `create_order` (qui ne reçoit aucun optionId, il re-résout seul) répondait
 * 67,40 $. Prix vu ≠ prix payé, +34 %, et la face vue sélectionnée changée en
 * silence. En Mode B, l'`expectedGrossCents` calculé sur l'écran du widget
 * faisait échouer la commande sur « Le prix a changé depuis ton devis ».
 */
function resolveSelectionAndQuote(
  groups: Record<string, SinaliteOption[]>,
  quantity: number,
  selectedOptions: Set<number>,
  index: Map<string, number>,
): { perGroup: Record<string, SinaliteOption>; optionIds: number[]; price: number | null } {
  const qtyOpt = (groups['qty'] ?? []).find((o) => Number(o.name) === quantity) ?? (groups['qty'] ?? [])[0];
  const nonQty = Object.entries(groups).filter(([g]) => g !== 'qty' && (groups[g]?.length ?? 0) > 0);

  const fixed: Record<string, SinaliteOption> = {};
  const free: Array<[string, SinaliteOption[]]> = [];
  for (const [g, opts] of nonQty) {
    const picked = opts.find((o) => selectedOptions.has(o.id));
    if (picked) { fixed[g] = picked; continue; } // choix explicite de l'user : prioritaire
    const rectoVerso =
      g === 'Stock' && isSidednessGroup(opts.map((o) => o.name))
        ? opts.find((o) => classifySidedness(o.name) === 'double')
        : undefined;
    if (rectoVerso) fixed[g] = rectoVerso;
    else free.push([g, opts]); // 1re option en tête → testée d'abord
  }

  const buildIds = (perGroup: Record<string, SinaliteOption>): number[] =>
    [...Object.values(perGroup).map((o) => o.id), ...(qtyOpt ? [qtyOpt.id] : [])];

  // Balaye les combos des groupes LIBRES (1er-de-chaque testé en premier) → 1er chiffré.
  const combos = cartesian(free.map(([g, opts]) => opts.map((o) => [g, o] as [string, SinaliteOption])));
  for (const combo of combos) {
    const perGroup = { ...fixed, ...Object.fromEntries(combo) };
    const ids = buildIds(perGroup);
    const price = lookupVariant(ids, index);
    if (price !== null) return { perGroup, optionIds: ids, price };
  }
  // Aucun combo chiffré → défaut 1er-de-chaque, prix null.
  const perGroup = { ...fixed, ...Object.fromEntries(free.map(([g, opts]) => [g, opts[0]])) };
  return { perGroup, optionIds: buildIds(perGroup), price: lookupVariant(buildIds(perGroup), index) };
}

export async function buildConfiguratorPayload(input: ConfiguratorInput): Promise<ConfiguratorPayload> {
  const products = listPrintProducts().map((p) => ({ slug: p.slug, name: p.name }));
  const slug = input.slug || products[0]?.slug;
  if (!slug || !getVirtualProduct(slug)) {
    return { products, selected: null, optionGroups: [], selection: null, quote: slug ? { ok: false, message: `Produit inconnu : ${slug}.` } : null };
  }

  const vp = getVirtualProduct(slug)!;
  const papers = virtualPapers(slug).map((paper) => ({
    key: paper.key,
    label: paper.label,
    description: paper.desc,
    finishes: virtualFinishes(slug, paper.key).map((v) => ({ key: v.finish, label: v.finishLabel })),
  }));
  const paper = papers.find((p) => p.key === input.paper)?.key ?? papers[0]?.key ?? null;
  const paperObj = paper ? papers.find((p) => p.key === paper) : undefined;
  const finish = paperObj?.finishes.find((f) => f.key === input.finish)?.key ?? paperObj?.finishes[0]?.key ?? null;

  const baseSelected = { slug, name: vp.name, papers, quantities: [] as number[] };
  const productId = paper && finish ? resolveVirtualProductId(slug, paper, finish) : null;
  if (productId === null) {
    return { products, selected: baseSelected, optionGroups: [], selection: { slug, paper, finish, quantity: null, options: [] }, quote: { ok: false, message: 'Combinaison papier/finition invalide.' } };
  }

  try {
    const [detail, enriched] = await Promise.all([sinalite.getProductDetail(productId), getEnrichedVariantIndex(productId)]);

    // Produit masqué par l'admin : ni options ni prix. `getEnrichedVariantIndex`
    // renvoie l'index BRUT (sans marge) dans ce cas, en comptant sur l'appelant
    // pour refuser — sans cette garde, le configurateur MCP affichait les
    // produits cachés au prix coûtant. Message explicite : « prix indisponible,
    // essaie un autre choix » aurait envoyé l'agent chercher une combinaison
    // qui n'existe pas.
    // Idem pour un groupe entièrement masqué : la combinaison sortirait
    // incomplète et le repli distant la ferait quand même chiffrer (cf.
    // fullyHiddenGroups).
    if (enriched.disabled || fullyHiddenGroups(detail.options, enriched.hiddenOptionIds).length > 0) {
      return {
        products,
        selected: baseSelected,
        optionGroups: [],
        selection: { slug, paper, finish, quantity: null, options: [] },
        quote: { ok: false, message: `Produit indisponible : ${slug}.` },
      };
    }

    const groups = groupVisibleOptions(detail.options, enriched.hiddenOptionIds);
    const quantities = availableQuantities(groups);
    const quantity =
      input.quantity && quantities.includes(input.quantity) ? input.quantity
      : quantities.includes(PREFERRED_DEFAULT_QTY) ? PREFERRED_DEFAULT_QTY
      : (quantities[0] ?? null);

    let optionGroups: ConfiguratorOptionGroup[] = [];
    let selectionOptionIds: number[] = [];
    let quote: ConfiguratorQuote | null = null;

    if (quantity) {
      const { perGroup, optionIds, price: localPrice } = resolveSelectionAndQuote(groups, quantity, new Set(input.options ?? []), enriched.index);
      // Le balayage ci-dessus reste LOCAL à dessein : il teste jusqu'à `cap`
      // combinaisons, et les faire toutes en distant enverrait autant d'appels
      // facturés chez Sinalite. On ne replie donc qu'UNE fois, sur la
      // combinaison retenue — ce qui suffit à couvrir le cas réel (l'index ne
      // contient AUCUN palier de quantité utile, cf. resolve-price.ts), sans
      // transformer un affichage en rafale d'appels.
      const price = localPrice ?? (await resolveVariantPrice(productId, optionIds, enriched));
      selectionOptionIds = Object.values(perGroup).map((o) => o.id);
      // Groupes PRÉSENTABLES = non-qty avec ≥2 options (un vrai choix).
      optionGroups = Object.entries(groups)
        .filter(([g, opts]) => !NEVER_SELECTABLE.has(g) && opts.length >= 2)
        .map(([g, opts]) => ({
          key: g,
          label: groupLabel(g),
          options: opts.map((o) => ({ id: o.id, label: optionLabel(g, o.name) })),
          selectedId: perGroup[g]?.id ?? opts[0].id,
        }));
      quote = price !== null
        ? { ok: true, totalCad: Math.round(price * 100) / 100, unitPriceCad: Math.round((price / quantity) * 10000) / 10000, quantity }
        : { ok: false, message: 'Prix indisponible pour cette combinaison — essaie un autre choix (faces, délai…).' };
    }

    return {
      products,
      selected: { ...baseSelected, quantities },
      optionGroups,
      selection: { slug, paper, finish, quantity, options: selectionOptionIds },
      quote,
    };
  } catch {
    // Sinalite/Prisma down → au moins papiers/finitions (pas de groupes/devis).
    return { products, selected: baseSelected, optionGroups: [], selection: { slug, paper, finish, quantity: null, options: [] }, quote: { ok: false, message: 'Options/prix temporairement indisponibles.' } };
  }
}
