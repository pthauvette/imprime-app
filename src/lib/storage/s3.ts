/**
 * S3 client + presigned upload helper.
 *
 * Stratégie : browser upload direct vers S3 via presigned POST (vs server
 * piping). Avantages :
 *   - 0 bande passante côté Amplify Lambda (fichiers print PDF font 20-100MB)
 *   - 0 risque de timeout Lambda (15 min hard limit Amplify Hosting)
 *   - Coût S3 PUT direct moindre que via NAT gateway
 *
 * MODÈLE DE SÉCURITÉ (décision assumée — revue privacy 2026-06) : le bucket
 * reste public-read pour que Sinalite puisse DOWNLOAD l'artwork à la production
 * (parfois plusieurs jours après le paiement) sans presigned URL (qui plafonne
 * à 7 j SigV4 → risque d'expiration avant production). La sécurité repose donc
 * ENTIÈREMENT sur l'imprévisibilité de la clé (UUID v4 = 122 bits d'entropie).
 *
 * ⚠️ Ces fichiers PEUVENT contenir des PII (une carte de visite = nom/tél/
 * adresse). « Quiconque voit l'URL peut télécharger » → la clé DOIT être
 * cryptographiquement indevinable (cf. buildUploadKey + node:crypto.randomUUID,
 * JAMAIS Math.random). Durcissement infra recommandé (hors code, console AWS) :
 * S3 Block Public Access scopé + lifecycle de purge des `uploads/` anciens.
 */

import { randomUUID } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost, type PresignedPost } from '@aws-sdk/s3-presigned-post';

// ─── ENV CONFIG ───────────────────────────────────────────────────────────

const REGION = process.env.S3_REGION ?? 'ca-central-1';
const BUCKET = process.env.S3_BUCKET ?? '';
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID ?? '';
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY ?? '';

const S3_CONFIGURED = !!(BUCKET && ACCESS_KEY && SECRET_KEY);

// ─── CLIENT (singleton) ───────────────────────────────────────────────────

/** Nom du bucket, pour les modules qui composent des commandes S3 (route proxy
 *  d'artwork). Lu à l'import comme le reste de la config de ce module — un test
 *  qui le manipule doit poser l'env AVANT d'importer (piège déjà rencontré). */
export const S3_BUCKET = BUCKET;

let _client: S3Client | null = null;
/** Client partagé — exporté pour que la route proxy signe des GET sans
 *  reconstruire (ni redupliquer) la configuration de credentials. */
export function getS3Client(): S3Client {
  return getClient();
}

function getClient(): S3Client {
  if (_client) return _client;
  if (!S3_CONFIGURED) {
    throw new Error(
      'S3 not configured — set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in env',
    );
  }
  _client = new S3Client({
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
  return _client;
}

// ─── ACCEPTED FILE TYPES ──────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/postscript',           // .ai, .eps
  'image/vnd.adobe.photoshop',        // .psd
  'application/x-photoshop',          // .psd alt
  'image/jpeg',
  'image/png',
  'image/tiff',
] as const;

export const MAX_FILE_SIZE_BYTES = 150 * 1024 * 1024; // 150 MB

export type AllowedMime = typeof ALLOWED_MIME_TYPES[number];

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

// ─── PRESIGNED POST GENERATION ────────────────────────────────────────────

export interface PresignOptions {
  /** "front" | "back" | "other" — used in the storage key for clarity */
  kind: 'front' | 'back' | 'other';
  /** Browser-detected MIME type — server validates against allow-list */
  contentType: string;
  /** Original filename — for display + extension preservation */
  filename: string;
  /** Optional userId (for organizing storage by user) */
  userId?: string;
  /** Max size in bytes — defaults to MAX_FILE_SIZE_BYTES if not specified */
  maxBytes?: number;
}

export interface PresignResult {
  /** Server-generated key the browser must use (already in policy) */
  key: string;
  /** Public URL where the file will live after upload */
  publicUrl: string;
  /** Form data for browser to multipart-POST to `url` */
  presigned: PresignedPost;
}

/**
 * Génère les params POST signés pour upload browser direct vers S3.
 * Le browser fait ensuite : `new FormData()` avec presigned.fields + le File,
 * puis POST à `presigned.url`.
 */
export async function createUploadPresign(opts: PresignOptions): Promise<PresignResult> {
  if (!isAllowedMime(opts.contentType)) {
    throw new Error(`Type de fichier non supporté : ${opts.contentType}`);
  }

  const ext = filenameExtension(opts.filename) ?? mimeToExt(opts.contentType);
  // Clé = seule barrière de sécurité (objet public-read) → UUID crypto + bornage.
  const key = buildUploadKey(opts.userId ?? 'guest', opts.kind, ext);

  const maxBytes = Math.min(opts.maxBytes ?? MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_BYTES);

  // ─── SÉCURITÉ : MIME enforcement multi-couche ─────────────────────
  // L'audit (Round 14 #3) a flaggé un risque théorique : si le client
  // passait un contentType mal-validé, il pourrait upload un text/html
  // arbitrary qui se ferait servir par S3.
  // Défense en profondeur appliquée :
  //   1. Route /api/uploads/presign valide contentType via isAllowedMime()
  //      avant d'appeler ici → on filtre déjà l'allowlist.
  //   2. createUploadPresign re-valide isAllowedMime() (ligne 95 ci-dessus).
  //   3. La policy S3 ci-dessous force `Content-Type` à matcher EXACTEMENT
  //      ce qu'on a signé (['eq', '$Content-Type', opts.contentType]) — donc
  //      même si le client uploade en multipart avec un autre header, S3
  //      rejette le PUT. Pas de bypass possible côté browser.
  //   4. x-amz-meta-content-type-options=nosniff évite que les browsers
  //      content-sniff (UTF-8 inspection) un fichier servi via S3 et
  //      l'interprètent comme HTML/script.
  const presigned = await createPresignedPost(getClient(), {
    Bucket: BUCKET,
    Key: key,
    Conditions: [
      ['content-length-range', 1, maxBytes],
      ['eq', '$Content-Type', opts.contentType],
      // ACL public-read pour que Sinalite puisse fetch sans signature.
      // Si on veut plus secure plus tard : remove ce ACL et utiliser des
      // presigned GET URLs valides 7j pour Sinalite.
      ['eq', '$acl', 'public-read'],
      // Defense in depth : si le bucket policy laisse passer un mauvais
      // Content-Type via une autre route, le metadata nosniff empêche le
      // browser de sniffer.
      ['eq', '$x-amz-meta-content-type-options', 'nosniff'],
    ],
    Fields: {
      'Content-Type': opts.contentType,
      acl: 'public-read',
      'x-amz-meta-content-type-options': 'nosniff',
    },
    Expires: 600, // 10 min pour upload — large mais raisonnable pour 100MB+
  });

  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;

  return { key, publicUrl, presigned };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function filenameExtension(filename: string): string | null {
  const m = filename.match(/\.([a-zA-Z0-9]{1,5})$/);
  return m ? m[1].toLowerCase() : null;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/postscript': 'ai',
    'image/vnd.adobe.photoshop': 'psd',
    'application/x-photoshop': 'psd',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/tiff': 'tiff',
  };
  return map[mime] ?? 'bin';
}

/**
 * Construit la clé de stockage S3. La clé est la SEULE barrière de sécurité
 * (objets public-read), donc :
 *   - UUID v4 cryptographique (node:crypto.randomUUID, 122 bits) — JAMAIS
 *     Math.random (PRNG prévisible = clés devinables = modèle cassé).
 *   - `owner` (userId session-validé / 'guest') et `ext` bornés par allow-list
 *     en défense en profondeur (anti path-traversal dans la clé, même si non
 *     attaquant-contrôlés en pratique).
 * Pur + exporté → testable sans config S3 (cf. tests/s3-upload-key.test.ts).
 */
export function buildUploadKey(owner: string, kind: PresignOptions['kind'], ext: string): string {
  const safeOwner = /^[A-Za-z0-9_-]{1,64}$/.test(owner) ? owner : 'guest';
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'bin';
  // uploads/{user|guest}/{uuid}-{front|back}.{ext}
  return `uploads/${safeOwner}/${randomUUID()}-${kind}.${safeExt}`;
}

// ─── SUPPRESSION (droit à l'effacement — Loi 25 art. 28.1) ────────────────

/**
 * Extrait la CLÉ S3 d'une URL d'objet de NOTRE bucket.
 *
 * Retourne `null` pour toute URL étrangère : on ne supprime jamais sur la foi
 * d'une URL arbitraire trouvée en base (une valeur corrompue ou injectée ne
 * doit pas pouvoir viser un autre objet). Même principe que
 * `assertPlioFileUrl` côté MCP.
 */
export function s3KeyFromUrl(url: string | null | undefined): string | null {
  if (!url || !BUCKET) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // Formes émises par ce module : https://{bucket}.s3.{region}.amazonaws.com/{key}
  const hostOk = u.hostname === `${BUCKET}.s3.${REGION}.amazonaws.com`
    || u.hostname === `${BUCKET}.s3.amazonaws.com`;
  if (!hostOk) return null;
  const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  // Garde-fou : nos clés vivent toutes sous `uploads/`.
  return key.startsWith('uploads/') ? key : null;
}

export interface DeleteObjectsResult {
  /** Clés effectivement soumises à la suppression. */
  deleted: number;
  /** URLs ignorées (hors bucket, illisibles, hors préfixe uploads/). */
  skipped: number;
  /** Erreurs S3 par clé — non fatales, à journaliser. */
  errors: string[];
}

/**
 * Supprime des objets S3 à partir de leurs URLs publiques.
 *
 * POURQUOI (audit pré-lancement 2026-07, P1-1) : la route de suppression PIPEDA
 * anonymisait 10 tables mais ne touchait JAMAIS S3 — aucun `DeleteObject` dans
 * tout le dépôt — alors que le courriel de confirmation affirme au client
 * « Brouillons + designs → supprimés ». Les PDF restaient `public-read` à une
 * URL toujours valide, indéfiniment. Un design de carte d'affaires contient
 * couramment nom, téléphone et courriel.
 *
 * BEST-EFFORT ASSUMÉ : un échec S3 ne doit pas faire échouer l'anonymisation DB
 * (qui, elle, est transactionnelle et prioritaire). On retourne le détail pour
 * que l'appelant journalise et puisse relancer. À appeler HORS de la
 * transaction Prisma — un appel réseau n'a rien à faire dans une transaction.
 */
export async function deleteObjectsByUrl(urls: (string | null | undefined)[]): Promise<DeleteObjectsResult> {
  const keys = [...new Set(urls.map(s3KeyFromUrl).filter((k): k is string => !!k))];
  const skipped = urls.length - keys.length;
  if (keys.length === 0 || !S3_CONFIGURED) {
    return { deleted: 0, skipped, errors: S3_CONFIGURED ? [] : ['S3 non configuré'] };
  }

  const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = getClient();
  const errors: string[] = [];
  let deleted = 0;

  // L'API DeleteObjects plafonne à 1000 clés par appel.
  for (let i = 0; i < keys.length; i += 1000) {
    const lot = keys.slice(i, i + 1000);
    try {
      const res = await client.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: lot.map((Key) => ({ Key })), Quiet: true },
      }));
      deleted += lot.length - (res.Errors?.length ?? 0);
      for (const e of res.Errors ?? []) errors.push(`${e.Key}: ${e.Message}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'erreur S3 inconnue');
    }
  }

  return { deleted, skipped, errors };
}
