/**
 * MCP tool — `configure_print` : la BRIQUE DONNÉES du widget « configurateur »
 * (MCP Apps / ressource ui://). Renvoie, en JSON, tout ce que le widget affiche :
 * la liste des produits, les options du produit sélectionné (papiers/finitions/
 * quantités) et le devis live. Le widget rappelle ce même tool (`callServerTool`)
 * à chaque changement (produit/papier/finition/quantité) pour rafraîchir le prix.
 *
 * Présentation SEULEMENT : réutilise getProductOptions + getPrintQuote (= mêmes
 * prix que le checkout). N'écrit RIEN, ne touche AUCUN invariant money-critical.
 * Le bouton « Commander » du widget passe par sendMessage → create_order Mode A
 * (flux texte existant), jamais par un débit direct.
 *
 * Logique séparée du transport (route handler) pour être testable en unitaire.
 */
import { listPrintProducts } from './list-products';
import { getProductOptions, getPrintQuote, type ProductOptionsResult } from './quote';

/** Devis simplifié pour le widget (sous-ensemble lisible de QuoteResult). */
export type ConfiguratorQuote =
  | { ok: true; totalCad: number; unitPriceCad: number; quantity: number }
  | { ok: false; message: string; availableQuantities?: number[] };

export interface ConfiguratorPayload {
  /** Liste pour le menu déroulant produit (slug + nom). */
  products: Array<{ slug: string; name: string }>;
  /** Options du produit sélectionné (null si produit inconnu). */
  selected: Pick<ProductOptionsResult, 'slug' | 'name' | 'papers' | 'quantities'> | null;
  /** Sélection courante résolue (avec défauts appliqués). */
  selection: { slug: string; paper: string | null; finish: string | null; quantity: number | null } | null;
  /** Devis pour la sélection courante (null si incomplet/produit inconnu). */
  quote: ConfiguratorQuote | null;
}

export interface ConfiguratorInput {
  slug?: string;
  paper?: string;
  finish?: string;
  quantity?: number;
}

/** Quantité par défaut préférée si disponible (sinon la 1re proposée). */
const PREFERRED_DEFAULT_QTY = 500;

/**
 * Construit le payload du configurateur, en APPLIQUANT des défauts sensés quand
 * un champ est absent ou invalide (1er papier, 1re finition du papier, 500 ou la
 * 1re quantité) → le widget s'ouvre déjà entièrement configuré + chiffré.
 */
export async function buildConfiguratorPayload(input: ConfiguratorInput): Promise<ConfiguratorPayload> {
  const products = listPrintProducts().map((p) => ({ slug: p.slug, name: p.name }));
  const slug = input.slug || products[0]?.slug;
  if (!slug) return { products, selected: null, selection: null, quote: null };

  const options = await getProductOptions(slug);
  if (!options) {
    return {
      products,
      selected: null,
      selection: null,
      quote: { ok: false, message: `Produit inconnu : ${slug}.` },
    };
  }

  // Défauts : papier → finition (du papier) → quantité.
  const paper = options.papers.find((p) => p.key === input.paper)?.key ?? options.papers[0]?.key ?? null;
  const paperObj = paper ? options.papers.find((p) => p.key === paper) : undefined;
  const finish = paperObj?.finishes.find((f) => f.key === input.finish)?.key ?? paperObj?.finishes[0]?.key ?? null;
  const quantity =
    input.quantity && options.quantities.includes(input.quantity)
      ? input.quantity
      : options.quantities.includes(PREFERRED_DEFAULT_QTY)
        ? PREFERRED_DEFAULT_QTY
        : (options.quantities[0] ?? null);

  let quote: ConfiguratorQuote | null = null;
  if (paper && finish && quantity) {
    const q = await getPrintQuote(slug, paper, finish, quantity);
    quote = q.ok
      ? { ok: true, totalCad: q.totalCad, unitPriceCad: q.unitPriceCad, quantity: q.quantity }
      : { ok: false, message: q.message, availableQuantities: q.availableQuantities };
  }

  return {
    products,
    selected: { slug: options.slug, name: options.name, papers: options.papers, quantities: options.quantities },
    selection: { slug, paper, finish, quantity },
    quote,
  };
}
