/**
 * Construit le SinaliteOrderRequest pour une commande MCP (Mode B), à partir
 * d'items DÉJÀ résolus + le detailCache (pour résoudre optionId → nom de groupe).
 * Équivalent de buildSinalitePayload du checkout web, adapté aux inputs MCP.
 *
 * ⚠️ contact.email devient ShipEmail/BillEmail (contact de LIVRAISON Sinalite) —
 * jamais le customer_email Stripe ni le destinataire du courriel Plio (ceux-là =
 * email du COMPTE titulaire de la clé, cf. revue : anti-spam/phishing de tiers).
 */
import { composerNotes } from '@/lib/sinalite/order-notes';
import type { SinaliteOrderRequest, CaProvince, ShipMethod } from '@/lib/sinalite/types';
import type { sinalite } from '@/lib/sinalite/client';
import { toDeliverableUrl } from '@/lib/storage/artwork-url';

/** Applique l'indirection et note un éventuel repli dans le collecteur. */
function convertirArtwork(url: string, collecteur: string[]): string {
  const conv = toDeliverableUrl(url);
  if (conv.fallbackReason) collecteur.push(conv.fallbackReason);
  return conv.url;
}

type DetailCache = Map<number, Awaited<ReturnType<typeof sinalite.getProductDetail>>>;

export interface McpOrderItemResolved {
  productId: number;
  optionIds: number[];
  /** URL S3 Plio validée (assertPlioFileUrl). */
  fileUrl: string;
  internalRef?: string;
}

export interface McpContact {
  firstName: string;
  lastName: string;
  /** Contact de LIVRAISON (ShipEmail) — PAS le customer Stripe ni l'email de confirmation. */
  email: string;
  phone: string;
}

export interface McpShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  province: CaProvince;
  postalCode: string;
}

export function buildMcpSinalitePayload(input: {
  /** Collecteur de replis d'URL d'artwork — passé par l'appelant (jamais un
   *  état de module : Lambda traite des commandes en parallèle). L'appelant
   *  l'`await`e via reportArtworkFallbacks. REQUIS et non optionnel : un futur
   *  appelant qui l'oublierait perdrait les alertes en silence, sans que `tsc`
   *  bronche — on fait du compilateur le garde-fou. */
  artworkFallbacks: string[];
  items: McpOrderItemResolved[];
  detailCache: DetailCache;
  contact: McpContact;
  shippingAddress: McpShippingAddress;
  shippingMethod: ShipMethod;
  shippingNote?: string;
}): SinaliteOrderRequest {
  const a = input.shippingAddress;
  return {
    items: input.items.map((item) => {
      // Résout optionId → nom de groupe (Sinalite attend { "Stock": "30", … }).
      const detail = input.detailCache.get(item.productId);
      const options: Record<string, string> = {};
      if (detail) {
        for (const id of item.optionIds) {
          const opt = detail.options.find((o) => o.id === id);
          if (opt) options[opt.group] = String(id);
        }
      }
      return {
        productId: item.productId,
        options,
        // Artwork unique fourni par l'agent (URL S3 Plio) → fichier 'front'.
        // Même indirection que le chemin web (ARTWORK_URL_MODE) : les deux
        // chemins doivent produire la MÊME forme d'URL, sinon la bascule ne
        // couvrirait que la moitié des commandes.
        files: [{ type: 'front' as const, url: convertirArtwork(item.fileUrl, input.artworkFallbacks) }],
        ...(item.internalRef ? { extra: item.internalRef } : {}),
      };
    }),
    shippingInfo: {
      ShipFName: input.contact.firstName,
      ShipLName: input.contact.lastName,
      ShipEmail: input.contact.email,
      ShipAddr: a.line1,
      ShipAddr2: a.line2 ?? '',
      ShipCity: a.city,
      ShipState: a.province,
      ShipZip: a.postalCode,
      ShipCountry: 'CA' as const,
      ShipPhone: input.contact.phone,
      ShipMethod: input.shippingMethod,
    },
    billingInfo: {
      BillFName: input.contact.firstName,
      BillLName: input.contact.lastName,
      BillEmail: input.contact.email,
      BillAddr: a.line1,
      BillAddr2: a.line2 ?? '',
      BillCity: a.city,
      BillState: a.province,
      BillZip: a.postalCode,
      BillCountry: 'CA' as const,
      BillPhone: input.contact.phone,
    },
    // Passait le texte client BRUT, sans plafond ni nettoyage, vers un système
    // tiers. Même composition que le checkout web depuis 2026-08.
    ...(() => {
      const n = composerNotes({ shippingNote: input.shippingNote });
      return n ? { notes: n } : {};
    })(),
  };
}
