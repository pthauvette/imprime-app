/**
 * Snapshot itemized des items d'une commande, persisté dans
 * Order.itemsSnapshot pour ne pas avoir à re-fetch Sinalite à chaque
 * affichage de /orders, /orders/[id], emails, invoice PDF.
 *
 * Construit à order-creation time (api/orders/create) à partir du
 * `detailCache` (qui contient déjà les SinaliteProductDetail des produits
 * commandés) + des option IDs sélectionnés.
 *
 * Compat ascendante : les orders pré-Phase 2 ont itemsSnapshot=null →
 * les helpers parseItemsSnapshot retournent null, le renderer doit
 * retomber sur productSummary (label libre).
 */

import type { SinaliteOrderRequest } from '@/lib/sinalite/types';

export interface DisplayItemOption {
  /** Nom du groupe Sinalite : "size" | "Stock" | "Coating" | "Turnaround" | "qty" | ... */
  group: string;
  /** Label friendly affiché à l'user : "4 x 6", "14pt", "UV brillante". */
  label: string;
}

export interface DisplayItem {
  productId: number;
  productName: string;
  /** Options non-qty / non-turnaround (size, papier, finition, etc.). */
  options: DisplayItemOption[];
  /** Quantité de tirage (count d'unités), ex 500. */
  qty: number;
  /** Label brut Sinalite pour qty au cas où on veut "1,000 unités". */
  qtyLabel: string;
  /** Label délai si applicable ("Standard", "Rush 1 jour"). */
  turnaround?: string;
  /** Filename des PDFs uploadés pour cet item (extrait des URLs S3). */
  fileNames?: string[];
}

/**
 * Build le snapshot pour une commande à partir du payload Sinalite +
 * détails produits (déjà fetched à la création).
 *
 * `productDetails` : Map productId → SinaliteProductDetail
 * `productNames`   : Map productId → name (du SinaliteProduct, plus court
 *                    que le name dans le detail).
 */
export function buildItemsSnapshot(
  payload: SinaliteOrderRequest,
  productDetails: Map<number, { options: Array<{ id: number; name: string; group: string }> }>,
  productNames: Map<number, string>,
): DisplayItem[] {
  return payload.items.map((item) => {
    const detail = productDetails.get(item.productId);
    const optionsById = new Map(detail?.options.map((o) => [o.id, o]) ?? []);

    // item.options : Record<groupName, "optionId as string">
    // On résout chaque ID en {group, label} et on isole qty + turnaround.
    let qty = 0;
    let qtyLabel = '';
    let turnaround: string | undefined;
    const otherOptions: DisplayItemOption[] = [];

    for (const [groupKey, optIdStr] of Object.entries(item.options)) {
      const optId = Number(optIdStr);
      const opt = optionsById.get(optId);
      const groupNorm = (opt?.group ?? groupKey).toLowerCase();
      const label = opt?.name ?? optIdStr;

      if (groupNorm === 'qty') {
        qtyLabel = label;
        const parsed = Number(label);
        if (Number.isFinite(parsed)) qty = parsed;
      } else if (groupNorm === 'turnaround') {
        turnaround = label;
      } else {
        otherOptions.push({ group: opt?.group ?? groupKey, label });
      }
    }

    // Extract filenames from S3 URLs (last path segment, decoded).
    // Best-effort : si l'URL est non-standard on garde "fichier-N".
    const fileNames: string[] = item.files.map((f, i) => {
      try {
        const u = new URL(f.url);
        const seg = u.pathname.split('/').pop() ?? `fichier-${i + 1}`;
        return decodeURIComponent(seg).slice(0, 80);
      } catch {
        return `fichier-${i + 1}`;
      }
    });

    return {
      productId: item.productId,
      productName: productNames.get(item.productId) ?? `Produit #${item.productId}`,
      options: otherOptions,
      qty,
      qtyLabel,
      turnaround,
      fileNames: fileNames.length > 0 ? fileNames : undefined,
    };
  });
}

/**
 * Parse Order.itemsSnapshot (JSON string nullable) → DisplayItem[] | null.
 * Renderer doit gérer le null comme fallback vers productSummary.
 *
 * Defensive : si JSON mal formé ou shape mismatch, retourne null silencieusement
 * (pas de throw — on ne veut pas casser /orders à cause d'un snapshot corrompu).
 */
export function parseItemsSnapshot(snapshot: string | null): DisplayItem[] | null {
  if (!snapshot) return null;
  try {
    const parsed = JSON.parse(snapshot) as unknown;
    if (!Array.isArray(parsed)) return null;
    // Light shape validation — on accepte tout objet avec au moins productId+productName.
    const items: DisplayItem[] = [];
    for (const it of parsed) {
      if (typeof it !== 'object' || it === null) continue;
      const obj = it as Record<string, unknown>;
      if (typeof obj.productId !== 'number' || typeof obj.productName !== 'string') continue;
      items.push({
        productId: obj.productId,
        productName: obj.productName,
        options: Array.isArray(obj.options) ? (obj.options as DisplayItemOption[]) : [],
        qty: typeof obj.qty === 'number' ? obj.qty : 0,
        qtyLabel: typeof obj.qtyLabel === 'string' ? obj.qtyLabel : '',
        turnaround: typeof obj.turnaround === 'string' ? obj.turnaround : undefined,
        fileNames: Array.isArray(obj.fileNames) ? (obj.fileNames as string[]) : undefined,
      });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

/**
 * Helper pour render un summary compact d'un item, pour les listes denses
 * (table /orders, sidebar email, etc.). Ex :
 *   "Cartes 14pt UV · 4×6 · 14pt · 500 unités · Standard"
 */
export function shortItemSummary(item: DisplayItem): string {
  const parts: string[] = [item.productName];
  for (const opt of item.options) {
    parts.push(opt.label);
  }
  if (item.qtyLabel) parts.push(`${item.qtyLabel} unités`);
  if (item.turnaround) parts.push(item.turnaround);
  return parts.join(' · ');
}
