/**
 * Revue privacy / sécurité S3 — buildUploadKey.
 *
 * Les objets S3 sont public-read (Sinalite fetch l'artwork à la production) :
 * la clé est la SEULE barrière de sécurité. On verrouille donc qu'elle est
 * cryptographiquement indevinable (UUID v4) + le bornage owner/ext (défense en
 * profondeur anti path-traversal).
 */
import { describe, it, expect } from 'vitest';
import { buildUploadKey } from '@/lib/storage/s3';

const UUID_V4 = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/;

describe('buildUploadKey', () => {
  it('format attendu : uploads/{owner}/{uuid-v4}-{kind}.{ext}', () => {
    const key = buildUploadKey('user_abc123', 'front', 'pdf');
    expect(key).toMatch(/^uploads\/user_abc123\/[0-9a-f-]{36}-front\.pdf$/);
    expect(key).toMatch(UUID_V4);
  });

  it('UUID v4 crypto (pas Math.random) → 2000 clés toutes distinctes', () => {
    const keys = new Set(Array.from({ length: 2000 }, () => buildUploadKey('guest', 'back', 'pdf')));
    expect(keys.size).toBe(2000);
  });

  it('owner hors allow-list (path-traversal, espaces) → guest', () => {
    expect(buildUploadKey('../../etc', 'front', 'pdf')).toMatch(/^uploads\/guest\//);
    expect(buildUploadKey('a/b', 'front', 'pdf')).toMatch(/^uploads\/guest\//);
    expect(buildUploadKey('a b', 'front', 'pdf')).toMatch(/^uploads\/guest\//);
    expect(buildUploadKey('', 'front', 'pdf')).toMatch(/^uploads\/guest\//);
  });

  it('ext hors allow-list (majuscules, points, trop long) → bin', () => {
    expect(buildUploadKey('guest', 'front', 'PDF')).toMatch(/-front\.bin$/);
    expect(buildUploadKey('guest', 'front', 'p.df')).toMatch(/-front\.bin$/);
    expect(buildUploadKey('guest', 'front', 'toolong')).toMatch(/-front\.bin$/);
  });

  it('owner + ext valides passent tels quels ; kind respecté', () => {
    expect(buildUploadKey('cuid_OK-1', 'other', 'psd')).toMatch(/^uploads\/cuid_OK-1\/[0-9a-f-]{36}-other\.psd$/);
  });
});
