import { describe, it, expect } from 'vitest';
import { CATEGORY_GROUPS } from '@/lib/catalogue';
import { previewKindForSinaliteCategory, fitRect, substrateLabel, type FormatKind } from './format-preview';

const KINDS: FormatKind[] = ['souple', 'rigide', 'label', 'folded', 'flat'];

describe('previewKindForSinaliteCategory — substrat par catégorie', () => {
  it.each([
    ['Coroplast Signs & Yard Signs', 'rigide'],
    ['Foam Board', 'rigide'],
    ['Aluminum Signs', 'rigide'],
    ['Vinyl Banners', 'souple'],
    ['Pull Up Banners', 'souple'],
    ['X-Frame Banners', 'souple'],
    ['Roll Labels / Stickers', 'label'],
    ['Wall Decals', 'label'],
    ['Brochures', 'folded'],
    ['Booklets', 'folded'],
    ['Business Cards', 'flat'],
    ['Letterhead', 'flat'],
  ])('%s → %s', (cat, kind) => {
    expect(previewKindForSinaliteCategory(cat)).toBe(kind);
  });

  it('null/inconnu → flat (jamais d\'exception)', () => {
    expect(previewKindForSinaliteCategory(null)).toBe('flat');
    expect(previewKindForSinaliteCategory('Quantum Decoders')).toBe('flat');
  });

  it('CHAQUE catégorie de CATEGORY_GROUPS résout à un FormatKind valide', () => {
    for (const g of CATEGORY_GROUPS) {
      for (const cat of g.sinaliteCategories) {
        const kind = previewKindForSinaliteCategory(cat);
        expect(KINDS, `${cat} → kind invalide`).toContain(kind);
        expect(substrateLabel(kind)).toBeTruthy();
      }
    }
  });

  it('la famille bannières porte BIEN du souple ET du rigide (coroplaste ≠ vinyle)', () => {
    const banner = CATEGORY_GROUPS.find((g) => g.slug === 'bannieres')!;
    const kinds = new Set(banner.sinaliteCategories.map(previewKindForSinaliteCategory));
    expect(kinds.has('souple')).toBe(true);
    expect(kinds.has('rigide')).toBe(true);
  });
});

describe('fitRect — vrai ratio dans une boîte, centré', () => {
  it('paysage large (48×12) : rempli en largeur, centré verticalement, ratio exact', () => {
    const r = fitRect(48, 12, 344, 206); // 4:1 → plus large que la boîte
    expect(r.w).toBeCloseTo(344); // pleine largeur
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeGreaterThan(0); // centré verticalement
    expect(r.w / r.h).toBeCloseTo(48 / 12, 5);
    expect(r.h).toBeLessThanOrEqual(206 + 1e-9);
  });

  it('portrait (pull-up 33×80) : rempli en hauteur, largeur dérivée, ratio exact', () => {
    const r = fitRect(33, 80, 344, 206);
    expect(r.h).toBeCloseTo(206);
    expect(r.w / r.h).toBeCloseTo(33 / 80, 5);
    expect(r.x).toBeGreaterThan(0); // centré horizontalement
  });

  it('dimensions invalides → carré de repli (pas de NaN)', () => {
    for (const [w, h] of [[0, 5], [NaN, 2], [3, -1]] as const) {
      const r = fitRect(w, h, 344, 206);
      expect(Number.isFinite(r.w) && Number.isFinite(r.h)).toBe(true);
      expect(r.w).toBeGreaterThan(0);
      expect(r.h).toBeGreaterThan(0);
    }
  });
});
