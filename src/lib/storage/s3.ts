/**
 * S3 client + presigned upload helper.
 *
 * Stratégie : browser upload direct vers S3 via presigned POST (vs server
 * piping). Avantages :
 *   - 0 bande passante côté Amplify Lambda (fichiers print PDF font 20-100MB)
 *   - 0 risque de timeout Lambda (15 min hard limit Amplify Hosting)
 *   - Coût S3 PUT direct moindre que via NAT gateway
 *
 * Le bucket est public-read avec UUIDs cryptiques dans le path — Sinalite
 * doit pouvoir DOWNLOAD les files plus tard sans signature complexe. Les
 * URLs ne sont pas crawlables (random), mais quelqu'un qui voit l'URL peut
 * télécharger. C'est OK pour des designs print (rien de sensible perso).
 */

import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost, type PresignedPost } from '@aws-sdk/s3-presigned-post';

// ─── ENV CONFIG ───────────────────────────────────────────────────────────

const REGION = process.env.S3_REGION ?? 'ca-central-1';
const BUCKET = process.env.S3_BUCKET ?? '';
const ACCESS_KEY = process.env.S3_ACCESS_KEY_ID ?? '';
const SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY ?? '';

const S3_CONFIGURED = !!(BUCKET && ACCESS_KEY && SECRET_KEY);

// ─── CLIENT (singleton) ───────────────────────────────────────────────────

let _client: S3Client | null = null;
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
  const uuid = randomUuid();
  // Path : uploads/{user|guest}/{uuid}-{front|back}.{ext}
  // UUID au début pour éviter les collisions; userId pour organisation;
  // kind pour debugging facile depuis la console S3.
  const owner = opts.userId ?? 'guest';
  const key = `uploads/${owner}/${uuid}-${opts.kind}.${ext}`;

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

function randomUuid(): string {
  // Crypto.randomUUID est dispo en Node 19+ et browser modern
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback : random hex
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}
