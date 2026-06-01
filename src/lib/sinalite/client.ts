/**
 * Sinalite API client — server-side only.
 *
 * - Token cache : OAuth2 client credentials, refresh à exp - 5 min.
 * - Toutes les méthodes lèvent SinaliteError sur 4xx/5xx.
 * - storeCode hardcodé à env.SINALITE_STORE_CODE (en_ca pour Plio).
 *
 * Usage:
 *   const products = await sinalite.listProducts();
 *   const detail = await sinalite.getProductDetail(7);
 *   const variants = await sinalite.listVariants(7, 0);
 */

import { z } from 'zod';
import {
  SinaliteTokenResponse,
  SinaliteProductList,
  SinaliteProduct,
  SinaliteProductDetail,
  SinaliteVariant,
  SinalitePriceResponse,
  SinaliteOrderRequest,
  SinaliteOrderResponse,
  SinaliteShippingEstimateRequest,
  SinaliteShippingEstimateResponse,
  SinaliteOrderListItem,
  SinaliteOrderDetail,
  type StoreCode,
} from './types';
import { withSinaliteCache, SINALITE_CATALOG_TTL_MS } from './cache';

// ─── ENV (lazy) ─────────────────────────────────────────────────────────────

// Round 45 — résolution PARESSEUSE de l'env Sinalite.
//
// Avant : un IIFE faisait `schema.parse()` AU CHARGEMENT du module → throw si
// les creds manquaient. Comme ce client est importé par de nombreuses routes
// (webhooks stripe/sinalite, orders/create, crons, pages /order/*…), une seule
// var manquante crashait TOUTES ces routes au boot/build au lieu de dégrader
// la seule feature Sinalite. C'est la fragilité fail-hard corrigée après
// l'incident prod R42b dans lib/env.ts + instrumentation.ts.
//
// Désormais : l'import ne touche jamais process.env. La validation se fait à la
// 1re utilisation réelle (getToken/request/storeCode), mémoïsée ensuite. Une
// config manquante lève un SinaliteError CLAIR au moment de l'appel — fail-soft
// à l'import, fail-loud à l'usage.

const envSchema = z.object({
  SINALITE_CLIENT_ID: z.string().min(1),
  SINALITE_CLIENT_SECRET: z.string().min(1),
  SINALITE_API_BASE: z.string().url().default('https://api.sinaliteuppy.com'),
  SINALITE_AUDIENCE: z.string().url().default('https://apiconnect.sinalite.com'),
  SINALITE_AUTH_BASE: z.string().url().default('https://api.sinaliteuppy.com'),
  SINALITE_STORE_CODE: z.enum(['en_ca', 'en_us']).default('en_ca'),
});

type SinaliteEnv = z.infer<typeof envSchema>;

let cachedEnv: SinaliteEnv | null = null;

/**
 * Résout + valide l'env Sinalite à la 1re utilisation, puis mémoïse.
 * Lève un SinaliteError clair (503) si une creds requise manque — au moment
 * de l'appel, jamais au chargement du module (cf. note ENV ci-dessus).
 */
function getEnv(): SinaliteEnv {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse({
    SINALITE_CLIENT_ID: process.env.SINALITE_CLIENT_ID,
    SINALITE_CLIENT_SECRET: process.env.SINALITE_CLIENT_SECRET,
    SINALITE_API_BASE: process.env.SINALITE_API_BASE,
    SINALITE_AUDIENCE: process.env.SINALITE_AUDIENCE,
    SINALITE_AUTH_BASE: process.env.SINALITE_AUTH_BASE,
    SINALITE_STORE_CODE: process.env.SINALITE_STORE_CODE,
  });
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new SinaliteError(
      `Configuration Sinalite manquante ou invalide : ${missing}. ` +
        `Vérifie les variables d'env SINALITE_* (console Amplify / .env).`,
      503,
      '<config>',
      result.error.issues,
    );
  }
  cachedEnv = result.data;
  return cachedEnv;
}

// ─── ERRORS ───────────────────────────────────────────────────────────────

export class SinaliteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'SinaliteError';
  }
}

// ─── TOKEN CACHE ──────────────────────────────────────────────────────────

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

/** Refreshes 5 min before expiry to avoid mid-request expiration. */
const TOKEN_BUFFER_MS = 5 * 60 * 1000;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
    return cachedToken.token;
  }

  const env = getEnv();
  const res = await fetch(`${env.SINALITE_AUTH_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.SINALITE_CLIENT_ID,
      client_secret: env.SINALITE_CLIENT_SECRET,
      audience: env.SINALITE_AUDIENCE,
      grant_type: 'client_credentials',
    }),
    cache: 'no-store',
    // Round 37 #2 — Sans timeout, si l'endpoint Auth0 hang, tous les
    // requests Sinalite (qui appellent getToken d'abord) hangent aussi.
    // 10s couvre les pires latences observées + buffer.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unparseable>');
    throw new SinaliteError(
      `Failed to obtain Sinalite token: ${res.status}`,
      res.status,
      '/auth/token',
      body,
    );
  }

  const json = await res.json();
  // Sinalite live répond HTTP 200 même quand les credentials sont rejetées,
  // avec un body `{"message": "Invalid authentication request"}` au lieu du
  // OAuth standard. Détecter ce cas explicitement pour donner un message
  // d'erreur clair (sinon on a un ZodError opaque sur access_token).
  if (json && typeof json === 'object' && 'message' in json && !('access_token' in json)) {
    const msg = String((json as { message: unknown }).message);
    throw new SinaliteError(
      `Sinalite auth refusée : ${msg}. Vérifie que client_id/client_secret matchent l'environnement de SINALITE_API_BASE (stage vs live).`,
      401, // on traite comme un 401 logique même si HTTP était 200
      '/auth/token',
      json,
    );
  }
  const parsed = SinaliteTokenResponse.parse(json);

  // Decode JWT exp from payload (no verification — we trust Auth0's response)
  const expiresAt = decodeJwtExp(parsed.access_token) ?? Date.now() + 60 * 60 * 1000;

  cachedToken = { token: parsed.access_token, expiresAt };
  return parsed.access_token;
}

function decodeJwtExp(jwt: string): number | null {
  try {
    const [, payload] = jwt.split('.');
    if (!payload) return null;
    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    if (typeof decoded.exp !== 'number') return null;
    return decoded.exp * 1000;
  } catch {
    return null;
  }
}

// ─── REQUEST WRAPPER ──────────────────────────────────────────────────────

async function request<T>(
  endpoint: string,
  init: RequestInit & { schema: z.ZodType<T> },
): Promise<T> {
  const token = await getToken();
  const env = getEnv();
  const url = `${env.SINALITE_API_BASE}${endpoint}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
    // Round 37 #2 — Sans timeout, si Sinalite hang (rare mais arrivé en
    // prod), le request handler Next.js hang aussi → Lambda timeout 60s
    // par défaut → customer voit spinner → cart abandonné. 15s couvre
    // largement les pires queries (order/new avec gros payload).
    // Si l'init.signal est déjà set par le caller, on respecte (signal de
    // priorité). Sinon on impose le default.
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '<unparseable>');
    throw new SinaliteError(
      `Sinalite ${init.method ?? 'GET'} ${endpoint} → ${res.status}`,
      res.status,
      endpoint,
      body,
    );
  }

  const json = await res.json();
  // Wrap le parse Zod pour exposer la shape réelle de la réponse + le path
  // qui échoue — sinon on a juste un ZodError opaque dans Sentry.
  const parsed = init.schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => ({
      path: i.path.join('.'),
      code: i.code,
      message: i.message,
    }));
    // Snippet de la response pour comprendre la shape inattendue
    const sample = JSON.stringify(json, null, 2).slice(0, 1200);
    throw new SinaliteError(
      `Sinalite ${init.method ?? 'GET'} ${endpoint} → schema mismatch (${issues.length}+ issues)`,
      res.status,
      endpoint,
      { issues, sample },
    );
  }
  return parsed.data;
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────

export const sinalite = {
  // Getter (pas une data-property) pour ne PAS résoudre l'env au chargement du
  // module — sinon on re-throw à l'import, ce que tout ce refactor évite.
  get storeCode(): StoreCode {
    return getEnv().SINALITE_STORE_CODE as StoreCode;
  },

  /**
   * GET /product → catalogue complet (~1200 produits).
   * Wrapped en withSinaliteCache : si Sinalite down, on sert le dernier
   * catalogue connu plutôt qu'un 500 (le wizard reste utilisable).
   */
  async listProducts() {
    // Round 36 #3 — TTL 10 min : catalog change rarement, évite 1 round-trip
    // Sinalite par render /order/start. Fallback stale toujours actif si
    // Sinalite down après expiration cache.
    return withSinaliteCache('/product',
      () => request('/product', { method: 'GET', schema: SinaliteProductList }),
      { ttlMs: SINALITE_CATALOG_TTL_MS },
    );
  },

  /** GET /product/{id}. Pas cacheable agressivement — appelé rarement. */
  async getProduct(id: number) {
    const result = await request(`/product/${id}`, {
      method: 'GET',
      schema: z.array(SinaliteProduct).min(1),
    });
    return result[0];
  },

  /**
   * GET /product/{id}/{storeCode} → tuple [options, pricing, metadata].
   * Wrapped en cache : critique pour le wizard configure. Si down, on
   * sert stale → user peut configurer + payer même pendant un outage.
   */
  async getProductDetail(id: number) {
    // Round 36 #3 — TTL 10 min, même rationale que listProducts
    return withSinaliteCache(`/product/${id}/${this.storeCode}`,
      async () => {
        const data = await request(`/product/${id}/${this.storeCode}`, {
          method: 'GET',
          schema: SinaliteProductDetail,
        });
        return {
          options: data[0],
          pricing: data[1],
          metadata: data[2].map((m) => m.metadata),
        };
      },
      { ttlMs: SINALITE_CATALOG_TTL_MS },
    );
  },

  /**
   * GET /variants/{id}/{offset} → jusqu'à 1000 variantes {price, key}.
   * key = sortedOptionIds.join('-') côté client pour O(1) lookup.
   */
  async listVariants(productId: number, offset = 0) {
    return request(`/variants/${productId}/${offset}`, {
      method: 'GET',
      schema: z.array(SinaliteVariant),
    });
  },

  /** GET /pricebykey/{id}/{key} (note: PAS /pricedbykey, doc obsolète). */
  async getPriceByKey(productId: number, key: string) {
    const result = await request(`/pricebykey/${productId}/${key}`, {
      method: 'GET',
      schema: z.array(z.object({ price: z.number() })).min(1),
    });
    return result[0].price;
  },

  /** POST /price/{id}/{storeCode} body {productOptions: [optionIds]} */
  async getPrice(productId: number, optionIds: number[]) {
    return request(`/price/${productId}/${this.storeCode}`, {
      method: 'POST',
      body: JSON.stringify({ productOptions: optionIds }),
      schema: SinalitePriceResponse,
    });
  },

  /** POST /order/shippingEstimate → array of [carrier, method, price, days]. */
  async estimateShipping(payload: SinaliteShippingEstimateRequest) {
    return request('/order/shippingEstimate', {
      method: 'POST',
      body: JSON.stringify(SinaliteShippingEstimateRequest.parse(payload)),
      schema: SinaliteShippingEstimateResponse,
    });
  },

  /** POST /order/new — débite le wallet Sinalite et déclenche la production. */
  async createOrder(payload: SinaliteOrderRequest) {
    return request('/order/new', {
      method: 'POST',
      body: JSON.stringify(SinaliteOrderRequest.parse(payload)),
      schema: SinaliteOrderResponse,
    });
  },

  /**
   * GET /order/list/{offset} → 10 commandes par page.
   *
   * NOTE: quand l'account n'a pas de commandes ou que l'offset dépasse la fin,
   * Sinalite renvoie {message:"Order not found.", status:"error"} au lieu de [].
   * On normalise en [] côté client.
   */
  async listOrders(offset = 0): Promise<z.infer<typeof SinaliteOrderListItem>[]> {
    const result = await request(`/order/list/${offset}`, {
      method: 'GET',
      schema: z.union([
        z.array(SinaliteOrderListItem),
        z.object({ message: z.string(), status: z.literal('error') }),
      ]),
    });
    // Normalize: Sinalite returns {message, status:"error"} when account is empty
    return Array.isArray(result) ? result : [];
  },

  /** GET /order/{id} → détail commande + items[]. Lève SinaliteError si introuvable. */
  async getOrder(orderId: number) {
    return request(`/order/${orderId}`, {
      method: 'GET',
      schema: SinaliteOrderDetail,
    });
  },

  /** Reset le cache token — utile pour les tests. */
  resetTokenCache() {
    cachedToken = null;
  },
};

export type SinaliteClient = typeof sinalite;
