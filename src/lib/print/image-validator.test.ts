import { describe, it, expect } from 'vitest';
import { assessImageResolution } from './image-validator';

describe('assessImageResolution — DPI à la taille d\'impression', () => {
  const bc = { widthInches: 3.5, heightInches: 2 }; // carte de visite

  it('haute résolution (300 DPI) → ok', () => {
    // 3.5×2 @ 300 DPI = 1050×600
    const r = assessImageResolution(1050, 600, bc);
    expect(r.level).toBe('ok');
    expect(r.meta?.effectiveDpi).toBe(300);
  });

  it('résolution écran/web (~72 DPI) → ERROR bloquant', () => {
    // 3.5×2 @ ~72 DPI = 252×144
    const r = assessImageResolution(252, 144, bc);
    expect(r.level).toBe('error');
    expect(r.issues[0].code).toBe('image-dpi-too-low');
    expect(r.meta!.effectiveDpi!).toBeLessThan(100);
  });

  it('résolution marginale (~120 DPI) → warning', () => {
    // 3.5×2 @ 120 DPI = 420×240
    expect(assessImageResolution(420, 240, bc).level).toBe('warning');
  });

  it('200 DPI → warning (aligné sur le minimum Sinalite 300, non bloquant)', () => {
    // 3.5×2 @ 200 DPI = 700×400. Avant : 'ok' (seuil 150) ; maintenant 'warning' (seuil 300).
    const r = assessImageResolution(700, 400, bc);
    expect(r.level).toBe('warning');
    expect(r.issues[0].code).toBe('image-dpi-low');
    expect(r.meta?.effectiveDpi).toBe(200);
  });

  it('tolère l\'orientation inversée (portrait pour un produit paysage)', () => {
    // 600×1050 (portrait) pour 3.5×2 → en rotation = 300 DPI → ok
    expect(assessImageResolution(600, 1050, bc).level).toBe('ok');
  });

  it('sans taille connue : garde-fou pixels absolus', () => {
    expect(assessImageResolution(2000, 1500).level).toBe('ok');
    expect(assessImageResolution(300, 200).level).toBe('error'); // < 400px de côté
    expect(assessImageResolution(300, 200).issues[0].code).toBe('image-too-small');
  });
});
