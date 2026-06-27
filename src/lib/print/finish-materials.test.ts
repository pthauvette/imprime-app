import { describe, it, expect } from 'vitest';
import { finishMaterial, KNOWN_FINISH_KEYS } from './finish-materials';

describe('finishMaterial', () => {
  it('UV → vernis brillant : clearcoat fort + rugosité de vernis basse', () => {
    const m = finishMaterial('uv');
    expect(m.clearcoat).toBeGreaterThanOrEqual(0.9);
    expect(m.clearcoatRoughness).toBeLessThan(0.2);
    expect(m.roughness).toBeLessThan(0.5);
    expect(m.metalness).toBe(0);
  });

  it('mat → clearcoat très bas, surface diffuse', () => {
    const m = finishMaterial('matte');
    expect(m.clearcoat).toBeLessThan(0.3);
    expect(m.roughness).toBeGreaterThan(0.6);
  });

  it('soft-touch → voile velouté (sheen) + mat, sans vernis', () => {
    const m = finishMaterial('soft-touch');
    expect(m.sheen).toBeGreaterThanOrEqual(0.8);
    expect(m.clearcoat).toBe(0);
    expect(m.roughness).toBeGreaterThan(0.85);
  });

  it('spot-uv → vernis SÉLECTIF (flag spotUv)', () => {
    const m = finishMaterial('spot-uv');
    expect(m.spotUv).toBe(true);
    expect(m.clearcoat).toBeGreaterThanOrEqual(0.9);
  });

  it('foil → métallique avec couleur de métal', () => {
    const m = finishMaterial('foil');
    expect(m.metalness).toBe(1);
    expect(m.foilColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('finition inconnue → base neutre, aucun crash', () => {
    const m = finishMaterial('inexistant');
    expect(m.clearcoat).toBe(0);
    expect(m.metalness).toBe(0);
    expect(m.foilColor).toBeNull();
    expect(m.spotUv).toBe(false);
  });

  it('null/undefined → base neutre', () => {
    expect(finishMaterial(null).effectLabel).toBeTruthy();
    expect(finishMaterial(undefined).clearcoat).toBe(0);
  });

  it('papier nacré → iridescence > 0', () => {
    expect(finishMaterial('standard', 'pearl').iridescence).toBeGreaterThan(0);
  });

  it('papier kraft → teinte de base brunâtre', () => {
    expect(finishMaterial('standard', 'kraft').baseTint).toBeTruthy();
  });

  it('finition + papier : la finition prime sur le coating, le papier garde son iridescence', () => {
    // UV (clearcoat fort) sur papier nacré → le vernis gagne MAIS l'iridescence reste.
    const m = finishMaterial('uv', 'pearl');
    expect(m.clearcoat).toBeGreaterThanOrEqual(0.9); // finition prime
    expect(m.iridescence).toBeGreaterThan(0); // papier conservé
  });

  it('foil sur papier kraft : la teinte foil (foilColor) prime, baseTint papier ignoré', () => {
    const m = finishMaterial('foil', 'kraft');
    expect(m.foilColor).toBeTruthy();
    expect(m.metalness).toBe(1);
  });

  it('toutes les clés connues retournent un effectLabel non vide', () => {
    for (const k of KNOWN_FINISH_KEYS) {
      expect(finishMaterial(k).effectLabel.length).toBeGreaterThan(0);
    }
  });
});
