/**
 * Auth par clés API du serveur MCP.
 *
 * Conçu d'après une revue sécurité adversariale (workflow 8 agents). Décisions
 * verrouillées :
 *  - Clé = secret aléatoire 256-bit autonome (randomBytes), PAS un HMAC dérivé
 *    d'AUTH_SECRET (sa rotation casserait JWT + tous les HMAC existants).
 *  - On stocke SHA-256(token) (jamais le secret en clair) ; lookup par hash
 *    unique indexé → pas de comparaison de secret → timing-safe inutile ici
 *    (vs requireCronAuth qui compare un secret fixe connu).
 *  - verifyApiKey est TOTAL (ne throw jamais) : mcp-handler transforme tout throw
 *    de verifyToken en 401+WWW-Authenticate AVANT le test required:false, ce qui
 *    casserait les read-only publics sur un simple cold-start Neon.
 *  - lastUsedAt throttlé (1 write/60s) + AWAITÉ (anti-gel Lambda).
 *  - scopes RÉELLEMENT appliqués sur les mutations (requireScope), pas décoratifs.
 *
 * ⚠️ NE JAMAIS logger le token en clair (plaintext / bearerToken).
 */
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { logAuth } from '@/lib/logger';

/** Préfixe générique (live/test). Le pré-filtre matche CECI, jamais conditionné à
 *  NODE_ENV — sinon un basculement d'env révoquerait toutes les clés d'un coup. */
const KEY_PREFIX_GENERIC = 'plio_sk_';
const KEY_PREFIX_LIVE = 'plio_sk_live_';

/** Whitelist des scopes connus. parseScopes filtre tout le reste. */
export const API_KEY_SCOPES = ['orders:write', 'catalog:read'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Normalise un CSV de scopes : trim + lowercase + whitelist + dédup. Source unique
 *  utilisée par la vérif, le script de minting et les routes self-serve. */
export function parseScopes(csv: string | null | undefined): ApiKeyScope[] {
  if (!csv) return [];
  const set = new Set<ApiKeyScope>();
  for (const raw of csv.split(',')) {
    const s = raw.trim().toLowerCase();
    if ((API_KEY_SCOPES as readonly string[]).includes(s)) set.add(s as ApiKeyScope);
  }
  return [...set];
}

/**
 * SHA-256 hex (64 chars lowercase) du token complet. Sert au stockage ET au lookup.
 * INVARIANT : hex lowercase, 64 chars — ne PAS changer (encodage/casse) sans migrer
 * toutes les clés (sinon tous les lookups échouent en silence, fail-closed).
 * SHA-256 non salé est volontaire et suffisant : le secret est 256-bit aléatoire,
 * donc non brute-forçable ; bcrypt/argon2 ne protègent que les secrets faibles.
 */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Génère un token en clair + ses dérivés à stocker. Le token n'est montré qu'UNE fois. */
export function generateApiKey(): { token: string; keyHash: string; keyPrefix: string } {
  const secret = randomBytes(32).toString('base64url'); // 256 bits, URL/header-safe
  const token = `${KEY_PREFIX_LIVE}${secret}`;
  // keyPrefix = préfixe fixe + 6 chars du secret : repère visuel seulement
  // (reste ~220 bits secrets). NON @unique en DB (collision sans conséquence,
  // l'auth se fait sur keyHash unique).
  return { token, keyHash: hashApiKey(token), keyPrefix: token.slice(0, KEY_PREFIX_LIVE.length + 6) };
}

/** Utilisable si non révoquée et non expirée. Source unique de vérité du cycle de vie. */
export function isKeyUsable(
  key: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (key.revokedAt) return false;
  if (key.expiresAt && key.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export interface VerifiedKey {
  userId: string;
  keyId: string;
  scopes: ApiKeyScope[];
  role: string;
}

const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Vérifie un token en clair. TOTAL : ne throw JAMAIS (null sur toute erreur DB).
 * Lookup indexé par keyHash → filtre révocation/expiration → maj lastUsedAt
 * throttlée et tolérante. Retourne le contexte si valide, sinon null.
 */
export async function verifyApiKey(plaintext: string): Promise<VerifiedKey | null> {
  try {
    if (!plaintext || !plaintext.startsWith(KEY_PREFIX_GENERIC)) return null; // pré-filtre cheap
    const keyHash = hashApiKey(plaintext);
    const key = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true, userId: true, scopes: true, revokedAt: true, expiresAt: true, lastUsedAt: true,
        user: { select: { role: true } },
      },
    });
    if (!key || !isKeyUsable(key)) return null;

    const stale = !key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
    if (stale) {
      try {
        await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
      } catch (err) {
        logAuth.warn({ keyId: key.id, err: String(err) }, 'mcp: lastUsedAt update failed (auth ok)');
      }
    }

    return { userId: key.userId, keyId: key.id, scopes: parseScopes(key.scopes), role: key.user.role };
  } catch (err) {
    // Erreur DB (cold-start Neon, timeout) → anonyme, JAMAIS throw (sinon 401 global).
    logAuth.warn({ err: String(err) }, 'mcp: verifyApiKey failed (treating as anonymous)');
    return null;
  }
}

// ── Gardes pour les tools ────────────────────────────────────────────────────

type McpError = { content: { type: 'text'; text: string }[]; isError: true };
/** Forme minimale de l'`extra` du handler de tool qu'on lit (évite le couplage SDK). */
export interface ToolAuthExtra {
  authInfo?: { scopes?: string[]; extra?: Record<string, unknown> };
}
export type RequiredUser = { ok: true; userId: string; keyId: string; role: string; scopes: ApiKeyScope[] };

function mcpError(text: string): McpError {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Exige une clé valide. Retourne l'identité, ou un résultat d'erreur MCP prêt à retourner. */
export function requireUser(extra: ToolAuthExtra): RequiredUser | { ok: false; error: McpError } {
  const info = extra.authInfo;
  const userId = info?.extra?.userId;
  if (!userId || typeof userId !== 'string') {
    return {
      ok: false,
      error: mcpError(
        "Authentification requise. Fournis une clé API Plio dans l'en-tête Authorization: Bearer plio_sk_live_… (génère-la dans ton compte Plio › Clés API).",
      ),
    };
  }
  return {
    ok: true,
    userId,
    keyId: String(info?.extra?.keyId ?? ''),
    role: String(info?.extra?.role ?? 'USER'),
    scopes: Array.isArray(info?.scopes) ? parseScopes(info.scopes.join(',')) : [],
  };
}

/** Exige une clé valide AVEC un scope (mutations). Sinon une clé "lecture" pourrait commander. */
export function requireScope(
  extra: ToolAuthExtra,
  scope: ApiKeyScope,
): RequiredUser | { ok: false; error: McpError } {
  const u = requireUser(extra);
  if (!u.ok) return u;
  if (!u.scopes.includes(scope)) {
    return {
      ok: false,
      error: mcpError(`Scope insuffisant : cette clé n'a pas '${scope}'. Régénère une clé avec ce scope dans ton compte Plio.`),
    };
  }
  return u;
}
