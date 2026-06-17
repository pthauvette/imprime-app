/**
 * Vérification d'un access token OAuth (JWT WorkOS) pour le serveur MCP.
 * Conçu via workflow adversarial — les 3 correctifs bloquants y sont intégrés :
 *
 *  H1 — TOTAL : ne throw JAMAIS (try/catch → null), miroir de verifyApiKey. Sinon
 *       une panne du JWKS ferait sauter le read-only public (mcp-handler transforme
 *       tout throw de verifyToken en 401 global, AVANT le check required:false).
 *  H2 — Audience binding : le token n'est accepté que si `aud` == resource canonique
 *       (mcpResourceUri, source unique). Défense anti token-confusion (un token émis
 *       pour un autre resource server est REJETÉ).
 *  M2 — Identité anti-account-takeover : email_verified obligatoire ; role FORCÉ
 *       'USER' (ADMIN réservé aux sessions web) ; scopes restreints à
 *       catalog:read + orders:write — JAMAIS orders:write:headless (paiement).
 *
 * PR2 : ce module n'est PAS encore câblé dans mcpVerifyToken (PR3, derrière flag).
 */
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { findUserByEmail } from '@/lib/db/orders';
import { logAuth } from '@/lib/logger';
import { mcpAcceptedAudiences, MCP_OAUTH_SCOPES } from './oauth-config';
import type { ApiKeyScope } from './auth';

/** Resolver de clé pour jose.jwtVerify : JWKS distant en prod, clé locale en test. */
type JwtKey = JWTVerifyGetKey;

/** JWKS distant en SINGLETON module (réutilisé entre requêtes ; jose cache les clés
 *  en mémoire — OK sur Lambda, refetch si `kid` inconnu). Correctif L1. */
let remoteJwks: JwtKey | null = null;
function defaultJwks(): JwtKey | null {
  const uri = process.env.MCP_OAUTH_JWKS_URI?.trim();
  if (!uri) return null;
  if (!remoteJwks) {
    try {
      remoteJwks = createRemoteJWKSet(new URL(uri));
    } catch {
      return null;
    }
  }
  return remoteJwks;
}

export interface OAuthVerifyResult {
  userId: string;
  scopes: ApiKeyScope[];
  /** Toujours 'USER' pour une identité OAuth — pas d'escalade ADMIN via le flow public. */
  role: 'USER';
  /** `sub` du token (pour log non sensible, jamais le JWT brut). */
  subject: string;
}

/**
 * Vérifie un access token OAuth. TOTAL : retourne null sur TOUT échec (JWKS down,
 * signature/aud/iss/exp invalides, email non vérifié) — jamais d'exception.
 * `keyOverride` : injecté en test (clé locale) ; en prod = le JWKS distant.
 */
export async function verifyOAuthBearer(token: string, keyOverride?: JwtKey): Promise<OAuthVerifyResult | null> {
  try {
    const key = keyOverride ?? defaultJwks();
    if (!key) return null; // OAuth non configuré

    const expectedIssuer = process.env.MCP_OAUTH_EXPECTED_ISSUER?.trim();
    const { payload } = await jwtVerify(token, key, {
      // H2 — aud DOIT correspondre à NOTRE resource. On tolère les 2 formes
      // (/api/mcp identifiant + /api/mcp/mcp endpoint) ; jose passe si aud ∈ la liste.
      audience: mcpAcceptedAudiences(),
      // WorkOS AuthKit signe en RS256 ; ES256 gardé (flexibilité + tests). Restreindre
      // la liste = défense anti alg-confusion (refuse alg:none / HS256-sur-clé-publique).
      algorithms: ['RS256', 'ES256'],
      ...(expectedIssuer ? { issuer: expectedIssuer } : {}),
      // jose valide exp/nbf automatiquement.
    });

    // M2 — email vérifié obligatoire (le lien JIT par email = même confiance que le magic-link).
    // ⚠️ WorkOS ne met PAS email/email_verified dans l'access token par défaut → il FAUT
    // un JWT Template (dashboard) qui injecte `{{ user.email }}` + `{{ user.email_verified }}`.
    // Selon le rendu du template, email_verified arrive en booléen `true` OU en chaîne "true"
    // → on accepte les deux (le token est déjà vérifié cryptographiquement + aud-bound, donc
    // élargir au "true" string n'ouvre aucune faille). Toute autre valeur (false/absent) → rejet.
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!email || !emailVerified) return null;

    // Scopes : on ACCORDE l'ensemble MCP_OAUTH_SCOPES à toute identité OAuth vérifiée.
    // WorkOS AuthKit n'émet que des scopes OIDC (openid/email/profile), pas nos scopes
    // custom → filtrer le claim `scope` donnerait []. MCP_OAUTH_SCOPES exclut
    // orders:write:headless (paiement) → JAMAIS octroyé via OAuth, quoi que le token
    // demande. Capacité accordée = catalogue + devis + create_order Mode A (lien de
    // finalisation sûr, aucun débit ni commande créée côté serveur).
    const scopes = [...MCP_OAUTH_SCOPES] as ApiKeyScope[];

    // Mapping identité : « clients Plio existants SEULEMENT » (décision produit
    // 2026-06-16). On NE crée PAS de compte ici — find-only : un email vérifié par
    // WorkOS qui ne correspond à AUCUN compte Plio (créé via le site magic-link OU
    // une commande) est REJETÉ (null → token refusé). Role forcé 'USER' (on n'utilise
    // JAMAIS le role DB de l'user matché → pas d'héritage ADMIN via OAuth).
    const user = await findUserByEmail(email);
    if (!user) {
      // Diagnostic des FAUX NÉGATIFS (vrai client qui s'authentifie avec un email
      // ≠ celui de son compte Plio). On logge le `sub` WorkOS (non-PII, cross-ref
      // dashboard), JAMAIS l'email (Loi 25). Sans ça, un client bloqué = silence.
      logAuth.info({ subject: String(payload.sub ?? '') }, 'OAuth: email vérifié sans compte Plio — accès MCP refusé');
      return null; // pas un client Plio → accès MCP refusé
    }
    return { userId: user.id, scopes, role: 'USER', subject: String(payload.sub ?? '') };
  } catch {
    return null; // H1 — TOTAL
  }
}
