import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createUploadPresign, isAllowedMime } = vi.hoisted(() => ({
  createUploadPresign: vi.fn(),
  isAllowedMime: vi.fn(),
}));
vi.mock('@/lib/storage/s3', () => ({
  createUploadPresign,
  isAllowedMime,
  // type-only ré-export inerte
  MAX_FILE_SIZE_BYTES: 150 * 1024 * 1024,
}));

import { getUploadPresign, uploadWidgetPayload } from './upload';

beforeEach(() => {
  vi.clearAllMocks();
  isAllowedMime.mockReturnValue(true);
  createUploadPresign.mockResolvedValue({
    key: 'uploads/u1/abc-front.pdf',
    publicUrl: 'https://plio.s3.ca-central-1.amazonaws.com/uploads/u1/abc-front.pdf',
    presigned: { url: 'https://plio.s3.ca-central-1.amazonaws.com', fields: { key: 'uploads/u1/abc-front.pdf' } },
  });
});

describe('getUploadPresign', () => {
  it('MIME permis → presign + publicUrl, signé sous le userId', async () => {
    const r = await getUploadPresign({ filename: 'carte.pdf', contentType: 'application/pdf', userId: 'u1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.publicUrl).toContain('/uploads/');
      expect(r.presigned.url).toContain('amazonaws.com');
    }
    expect(createUploadPresign).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'application/pdf', kind: 'front', userId: 'u1' }));
  });

  it('kind par défaut = front', async () => {
    await getUploadPresign({ filename: 'x.pdf', contentType: 'application/pdf' });
    expect(createUploadPresign).toHaveBeenCalledWith(expect.objectContaining({ kind: 'front' }));
  });

  it('MIME interdit → erreur, AUCUN presign signé', async () => {
    isAllowedMime.mockReturnValue(false);
    const r = await getUploadPresign({ filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('non supporté');
    expect(createUploadPresign).not.toHaveBeenCalled();
  });

  it('échec S3 → erreur propre (jamais throw)', async () => {
    createUploadPresign.mockRejectedValue(new Error('S3 down'));
    const r = await getUploadPresign({ filename: 'x.pdf', contentType: 'application/pdf' });
    expect(r.ok).toBe(false);
  });
});

describe('uploadWidgetPayload', () => {
  it('slug fourni / absent', () => {
    expect(uploadWidgetPayload('cartes-de-visite')).toEqual({ slug: 'cartes-de-visite' });
    expect(uploadWidgetPayload()).toEqual({ slug: null });
  });
});
