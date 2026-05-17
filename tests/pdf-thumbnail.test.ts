/**
 * Tests pour pdf-thumbnail — la vraie logique de render demande un DOM
 * canvas qui n'existe pas dans vitest node env. On teste les chemins
 * d'erreur safe (no-throw, retourne null).
 */

import { describe, it, expect } from 'vitest';
import { renderPdfThumbnail } from '@/lib/print/pdf-thumbnail';

describe('renderPdfThumbnail', () => {
  it('retourne null si pas de DOM (vitest node env)', async () => {
    // En env node sans document, le helper return null après le PDF parse
    // attempt. Pas de throw, juste null pour que le caller fasse fallback.
    const file = new File(['%PDF-1.4\nfake'], 'test.pdf', { type: 'application/pdf' });
    const r = await renderPdfThumbnail(file);
    expect(r).toBeNull();
  });

  it('retourne null pour file pas un PDF valide (sans throw)', async () => {
    const file = new File(['hello world'], 'test.pdf', { type: 'application/pdf' });
    const r = await renderPdfThumbnail(file);
    expect(r).toBeNull();
  });

  it('accepte options personnalisées sans crasher', async () => {
    const file = new File(['fake'], 'test.pdf', { type: 'application/pdf' });
    const r = await renderPdfThumbnail(file, { maxWidth: 200, quality: 0.5 });
    expect(r).toBeNull();
  });
});
