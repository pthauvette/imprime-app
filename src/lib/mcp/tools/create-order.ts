/**
 * MCP tool — `create_order` (Mode A : « configure + lien de finalisation »).
 *
 * Conçu d'après une revue sécurité adversariale (workflow 8 agents) qui a établi
 * que le paiement/upload HEADLESS (Mode B) accumule des failles critical (HMAC
 * port ne signe pas la quantité → sous-facturation ; idempotence instable →
 * double commande ; pas de dédup cross-Order au webhook ; contact.email tiers ;
 * le « scope de confiance » censé garder Mode B n'existe pas). → Mode B DIFFÉRÉ.
 *
 * Mode A (ce fichier) est SÛR : il NE crée NI Order, NI session Stripe, NE charge
 * rien, NE touche pas le HMAC. Il résout la config de l'agent (mêmes fonctions que
 * get_print_quote → devis == prix payé), puis renvoie un récap + un LIEN PROFOND
 * vers le wizard web où l'HUMAIN téléverse son fichier print-ready, confirme la
 * livraison (RE-estimée côté web) et paie. Toute la sécurité argent/fichier reste
 * dans le flux web existant (testé). Exige le scope orders:write.
 *
 * ⚠️ On ne fige PAS de prix de port signé dans l'URL (le wizard ré-estime) — fix
 * d'un finding de la revue (rejeu d'un port périmé).
 */
import { getVirtualProduct, resolveVirtualProductId } from '@/lib/products/virtual-products';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import { lookupVariant } from '@/lib/sinalite/pricing';
import { sinalite } from '@/lib/sinalite/client';
import { groupVisibleOptions, selectQuoteOptionIds } from './quote';

export interface OrderItemInput {
  slug: string;
  paper: string;
  finish: string;
  quantity: number;
}

export type ResolvedItem =
  | { ok: true; slug: string; name: string; paper: string; finish: string; quantity: number; productId: number; optionIds: number[]; subtotalCents: number; uploadUrl: string }
  | { ok: false; slug: string; reason: string; message: string; availableQuantities?: number[] };

/** Base URL de l'app (sans slash final). NEXT_PUBLIC_APP_URL est validé au build. */
function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://www.plio.ca').replace(/\/+$/, '');
}

/** Lien profond vers l'étape upload du wizard, produit déjà configuré (productId+options).
 *  PAS de port/sig figé : le wizard ré-estime la livraison à l'étape shipping. */
export function buildUploadUrl(productId: number, optionIds: number[]): string {
  return `${appBase()}/order/upload?productId=${productId}&options=${optionIds.join(',')}`;
}

/** Résout un item (slug/paper/finish/quantity) → productId + optionIds + sous-total + lien.
 *  Réutilise EXACTEMENT la logique de get_print_quote (devis == prix payé au checkout). */
export async function resolveOrderItem(item: OrderItemInput): Promise<ResolvedItem> {
  const vp = getVirtualProduct(item.slug);
  if (!vp) return { ok: false, slug: item.slug, reason: 'unknown_product', message: `Produit inconnu : ${item.slug}.` };

  const productId = resolveVirtualProductId(item.slug, item.paper, item.finish);
  if (productId === null) {
    return { ok: false, slug: item.slug, reason: 'invalid_combo', message: `Combinaison papier/finition invalide (${item.paper}/${item.finish}).` };
  }

  const [detail, enriched] = await Promise.all([
    sinalite.getProductDetail(productId),
    getEnrichedVariantIndex(productId),
  ]);
  if (enriched.disabled) {
    return { ok: false, slug: item.slug, reason: 'unavailable', message: `Produit indisponible : ${item.slug}.` };
  }

  const groups = groupVisibleOptions(detail.options, enriched.hiddenOptionIds);
  const sel = selectQuoteOptionIds(groups, item.quantity);
  if (!sel.ok) {
    return { ok: false, slug: item.slug, reason: 'quantity_unavailable', message: `Quantité ${item.quantity} indisponible.`, availableQuantities: sel.availableQuantities };
  }

  const total = lookupVariant(sel.optionIds, enriched.index);
  if (total === null) {
    return { ok: false, slug: item.slug, reason: 'price_unavailable', message: 'Prix indisponible pour cette configuration.' };
  }

  return {
    ok: true,
    slug: item.slug,
    name: vp.name,
    paper: item.paper,
    finish: item.finish,
    quantity: item.quantity,
    productId,
    optionIds: sel.optionIds,
    subtotalCents: Math.round(total * 100),
    uploadUrl: buildUploadUrl(productId, sel.optionIds),
  };
}

export interface OrderHandoff {
  items: ResolvedItem[];
  /** Somme des sous-totaux produits résolus (cents). Hors port + taxes (au checkout). */
  subtotalCents: number;
  anyError: boolean;
}

/** Résout tous les items (en parallèle) pour préparer le récap + les liens. */
export async function prepareOrderHandoff(items: OrderItemInput[]): Promise<OrderHandoff> {
  const resolved = await Promise.all(items.map((it) => resolveOrderItem(it)));
  const subtotalCents = resolved.reduce((sum, r) => (r.ok ? sum + r.subtotalCents : sum), 0);
  return { items: resolved, subtotalCents, anyError: resolved.some((r) => !r.ok) };
}

function fmtCad(cents: number): string {
  return `${(cents / 100).toFixed(2)} $ CAD`;
}

/** Récap texte + liens de finalisation (un par item). */
export function formatOrderHandoffText(h: OrderHandoff): string {
  const lines: string[] = ['Commande configurée. Récapitulatif :', ''];
  for (const r of h.items) {
    if (r.ok) {
      lines.push(`• ${r.quantity} × ${r.name} (${r.paper}/${r.finish}) — ${fmtCad(r.subtotalCents)}`);
      lines.push(`  Finaliser (téléverser le fichier + payer) : ${r.uploadUrl}`);
    } else {
      lines.push(`• ⚠️ ${r.slug} : ${r.message}${r.availableQuantities?.length ? ` (quantités : ${r.availableQuantities.join(', ')})` : ''}`);
    }
  }
  const okItems = h.items.filter((r) => r.ok).length;
  if (okItems > 0) {
    lines.push('', `Sous-total produits : ${fmtCad(h.subtotalCents)} _(livraison + taxes calculées au checkout)_.`);
    lines.push(
      okItems === 1
        ? "Ouvre le lien ci-dessus : tu y téléverses ton fichier print-ready, confirmes la livraison et payes en sécurité."
        : "Ouvre chaque lien pour configurer, téléverser le fichier et ajouter au panier, puis paye le tout au checkout.",
    );
  }
  if (h.anyError && okItems === 0) {
    lines.push('', "Aucun item valide. Corrige avec get_product_options puis réessaie.");
  }
  return lines.join('\n');
}
