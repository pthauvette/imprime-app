/**
 * POST /api/uploads/presign
 *
 * Body : { kind: 'front'|'back'|'other', contentType: string, filename: string }
 * Returns : { key, publicUrl, presigned: { url, fields } }
 *
 * Le browser ensuite :
 *   const fd = new FormData();
 *   Object.entries(presigned.fields).forEach(([k, v]) => fd.append(k, v));
 *   fd.append('file', fileBlob);
 *   await fetch(presigned.url, { method: 'POST', body: fd });
 *
 * Pas d'auth obligatoire — n'importe qui peut générer un presign + upload.
 * C'est OK parce que le bucket est cloisonné aux paths uploads/* et chaque
 * URL est cryptographically random (UUID). Pour un anti-abuse plus fort,
 * ajouter rate-limit par IP ici ou via WAF.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, parseBody } from '@/lib/api-helpers';
import { createUploadPresign, isAllowedMime, MAX_FILE_SIZE_BYTES } from '@/lib/storage/s3';
import { auth } from '@/auth';

const BodySchema = z.object({
  kind: z.enum(['front', 'back', 'other']),
  contentType: z.string().min(1),
  filename: z.string().min(1).max(255),
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await parseBody(req, BodySchema);

  if (!isAllowedMime(body.contentType)) {
    return NextResponse.json(
      {
        error: `Type non supporté : ${body.contentType}. Formats acceptés : PDF, AI, EPS, PSD, JPG, PNG, TIFF.`,
        maxBytes: MAX_FILE_SIZE_BYTES,
      },
      { status: 400 },
    );
  }

  // Si l'utilisateur est connecté, on organise par userId pour traçabilité.
  // Sinon (guest), bucket dans uploads/guest/.
  const session = await auth();
  const userId = session?.user?.id;

  const result = await createUploadPresign({
    kind: body.kind,
    contentType: body.contentType,
    filename: body.filename,
    userId,
  });

  return NextResponse.json({
    key: result.key,
    publicUrl: result.publicUrl,
    presigned: result.presigned,
    maxBytes: MAX_FILE_SIZE_BYTES,
  });
});
