/**
 * Garde anti-SSRF du `fileUrl` fourni par l'agent à create_order (Mode B).
 *
 * Conçu d'après une revue sécurité adversariale : Sinalite FETCHE l'URL lui-même
 * (pas Plio) → un HEAD content-type côté Plio ne garantit RIEN (TOCTOU), et une
 * URL arbitraire = SSRF + contenu non vérifié envoyé en production (coût réel au
 * webhook PAID). Le SEUL rempart fiable : exiger que l'objet vive dans l'infra
 * Plio — le bucket S3 Plio exact, préfixe `uploads/`. Un attaquant ne peut y
 * déposer un fichier qu'en passant par le flux d'upload présigné de Plio.
 *
 * (Durcissement ultérieur possible, cf. revue : copier l'objet dans un bucket
 * contrôlé avant de le passer à Sinalite. La garde host+préfixe est le minimum.)
 *
 * L'env est lu à l'APPEL (pas au module) → testable via vi.stubEnv.
 */

/** Host virtual-hosted du bucket Plio, ou null si S3 non configuré. */
export function plioFileHost(): string | null {
  const bucket = process.env.S3_BUCKET ?? '';
  if (!bucket) return null;
  const region = process.env.S3_REGION ?? 'ca-central-1';
  return `${bucket}.s3.${region}.amazonaws.com`;
}

export type FileUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

/**
 * Valide qu'un fileUrl pointe vers un objet du bucket S3 Plio (uploads/). Rejette
 * tout host externe, schéma non-https, chemin hors uploads/, ou URL malformée.
 */
export function assertPlioFileUrl(raw: string): FileUrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL de fichier invalide.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, reason: 'Le fichier doit être servi en HTTPS.' };
  }
  // Pas de userinfo (user:pass@host) — vecteur de confusion d'host.
  if (u.username || u.password) {
    return { ok: false, reason: 'URL de fichier malformée.' };
  }
  const host = plioFileHost();
  if (!host) {
    return { ok: false, reason: 'Stockage Plio non configuré.' };
  }
  if (u.host !== host) {
    return { ok: false, reason: "Le fichier doit être hébergé sur le stockage Plio. Téléverse-le d'abord via Plio (upload présigné), puis fournis l'URL retournée." };
  }
  if (!u.pathname.startsWith('/uploads/')) {
    return { ok: false, reason: 'Chemin de fichier non autorisé.' };
  }
  return { ok: true, url: u.toString() };
}
