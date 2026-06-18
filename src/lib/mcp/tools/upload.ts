/**
 * MCP tools d'upload : `upload_print_file` (ouvre le widget d'upload) +
 * `get_upload_url` (le widget l'appelle pour obtenir un POST S3 présigné).
 *
 * Le binaire ne transite JAMAIS par un appel d'outil (un outil reçoit du JSON).
 * Le widget (iframe) téléverse DIRECTEMENT vers S3 via le POST présigné, puis
 * appelle validate_print_file sur l'URL S3 retournée. Réutilise EXACTEMENT l'infra
 * web (`createUploadPresign`) — même bucket, même politique MIME, même clé random.
 *
 * SÛRETÉ : `getUploadPresign` ne déclenche aucun upload côté serveur ; il signe un
 * POST borné (MIME allowlist, taille S3, clé UUID). Le fichier qui en résulte vit
 * dans le bucket Plio uploads/ → directement validable + utilisable par Mode B
 * (assertPlioFileUrl le reconnaît).
 */
import { createUploadPresign, isAllowedMime, type PresignResult } from '@/lib/storage/s3';

export type UploadKind = 'front' | 'back' | 'other';

export type GetUploadPresignResult =
  | { ok: true; presigned: PresignResult['presigned']; publicUrl: string }
  | { ok: false; error: string };

/** Signe un POST S3 pour l'upload direct du widget. Réutilise l'infra web. */
export async function getUploadPresign(input: {
  filename: string;
  contentType: string;
  kind?: UploadKind;
  userId?: string;
}): Promise<GetUploadPresignResult> {
  if (!isAllowedMime(input.contentType)) {
    return { ok: false, error: `Type non supporté : ${input.contentType}. Acceptés : PDF, AI, EPS, PSD, JPG, PNG, TIFF.` };
  }
  try {
    const r = await createUploadPresign({
      kind: input.kind ?? 'front',
      contentType: input.contentType,
      filename: input.filename,
      userId: input.userId,
    });
    return { ok: true, presigned: r.presigned, publicUrl: r.publicUrl };
  } catch {
    return { ok: false, error: "Échec de la génération du lien d'upload." };
  }
}

/** Payload initial du widget d'upload (le produit, pour la validation ensuite). */
export function uploadWidgetPayload(slug?: string): { slug: string | null } {
  return { slug: slug ?? null };
}
