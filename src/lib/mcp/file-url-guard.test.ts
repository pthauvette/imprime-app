import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertPlioFileUrl } from './file-url-guard';

const HOST = 'plio-uploads.s3.ca-central-1.amazonaws.com';

beforeEach(() => {
  vi.stubEnv('S3_BUCKET', 'plio-uploads');
  vi.stubEnv('S3_REGION', 'ca-central-1');
});
afterEach(() => vi.unstubAllEnvs());

describe('assertPlioFileUrl — anti-SSRF', () => {
  it('URL S3 Plio valide (uploads/) → ok', () => {
    const r = assertPlioFileUrl(`https://${HOST}/uploads/u1/abc-front.pdf`);
    expect(r.ok).toBe(true);
  });

  it('host EXTERNE → rejeté (cœur de l\'anti-SSRF)', () => {
    expect(assertPlioFileUrl('https://evil.example/uploads/x.pdf').ok).toBe(false);
    // Bucket d'un attaquant sur S3 → rejeté (host ≠ bucket Plio).
    expect(assertPlioFileUrl('https://attacker-bucket.s3.ca-central-1.amazonaws.com/uploads/x.pdf').ok).toBe(false);
  });

  it('schéma non-https (http, file, gopher, …) → rejeté', () => {
    expect(assertPlioFileUrl(`http://${HOST}/uploads/x.pdf`).ok).toBe(false);
    expect(assertPlioFileUrl('file:///etc/passwd').ok).toBe(false);
    expect(assertPlioFileUrl(`gopher://${HOST}/uploads/x`).ok).toBe(false);
  });

  it('chemin hors uploads/ → rejeté', () => {
    expect(assertPlioFileUrl(`https://${HOST}/secret/key.pdf`).ok).toBe(false);
    expect(assertPlioFileUrl(`https://${HOST}/`).ok).toBe(false);
  });

  it('userinfo (confusion d\'host) → rejeté', () => {
    expect(assertPlioFileUrl(`https://evil@${HOST}/uploads/x.pdf`).ok).toBe(false);
  });

  it('URL malformée → rejeté', () => {
    expect(assertPlioFileUrl('pas une url').ok).toBe(false);
    expect(assertPlioFileUrl('').ok).toBe(false);
  });

  it('S3 non configuré → rejeté (pas de host Plio de référence)', () => {
    vi.stubEnv('S3_BUCKET', '');
    const r = assertPlioFileUrl(`https://${HOST}/uploads/x.pdf`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/non configuré/);
  });
});
