import { describe, it, expect } from 'vitest';
import { extractImagesFromOpList, computeImageDpiIssues, type OpsCodes, type EmbeddedImage } from './pdf-image-dpi';

// Codes d'opérateurs FACTICES (distincts) — l'extraction est pure, indépendante de pdfjs.
const OPS: OpsCodes = {
  save: 1, restore: 2, transform: 3,
  paintImageXObject: 4, paintInlineImageXObject: 5,
  paintFormXObjectBegin: 6, paintFormXObjectEnd: 7,
};

/** Construit (fnArray, argsArray) à partir de paires [op, args]. */
function ops(pairs: [number, unknown[]][]) {
  return { fn: pairs.map((p) => p[0]), args: pairs.map((p) => p[1]) };
}
const img = (px: number) => ['id', px, px];

describe('extractImagesFromOpList — suivi de la CTM', () => {
  it('image 300px dessinée à 1" (scale 72) → rendu 1"×1"', () => {
    const { fn, args } = ops([[OPS.transform, [72, 0, 0, 72, 0, 0]], [OPS.paintImageXObject, img(300)]]);
    const out = extractImagesFromOpList(fn, args, OPS);
    expect(out).toHaveLength(1);
    expect(out[0].pixelW).toBe(300);
    expect(out[0].renderedWidthIn).toBeCloseTo(1, 5);
    expect(out[0].renderedHeightIn).toBeCloseTo(1, 5);
  });

  it('image à 3" (scale 216) → rendu 3" (sera 100 DPI)', () => {
    const { fn, args } = ops([[OPS.transform, [216, 0, 0, 216, 0, 0]], [OPS.paintImageXObject, img(300)]]);
    const out = extractImagesFromOpList(fn, args, OPS);
    expect(out[0].renderedWidthIn).toBeCloseTo(3, 5);
  });

  it('save/restore : une transform poussée puis dépilée n\'affecte PAS l\'image suivante', () => {
    const { fn, args } = ops([
      [OPS.save, []],
      [OPS.transform, [288, 0, 0, 288, 0, 0]], // 4" — serait 75 DPI
      [OPS.restore, []],                        // dépile → retour identité
      [OPS.transform, [72, 0, 0, 72, 0, 0]],    // 1"
      [OPS.paintImageXObject, img(300)],
    ]);
    const out = extractImagesFromOpList(fn, args, OPS);
    expect(out).toHaveLength(1);
    expect(out[0].renderedWidthIn).toBeCloseTo(1, 5); // la transform sous save a bien été annulée
  });

  it('form XObject : la matrice de la forme s\'applique à l\'image, puis est dépilée', () => {
    const { fn, args } = ops([
      [OPS.paintFormXObjectBegin, [[288, 0, 0, 288, 0, 0], [0, 0, 1, 1]]], // forme à 4"
      [OPS.paintImageXObject, img(300)],                                    // dedans → 4"
      [OPS.paintFormXObjectEnd, []],                                        // dépile → identité
      [OPS.transform, [72, 0, 0, 72, 0, 0]],
      [OPS.paintImageXObject, img(300)],                                    // dehors → 1"
    ]);
    const out = extractImagesFromOpList(fn, args, OPS);
    expect(out).toHaveLength(2);
    expect(out[0].renderedWidthIn).toBeCloseTo(4, 5); // image dans la forme
    expect(out[1].renderedWidthIn).toBeCloseTo(1, 5); // image après la forme
  });

  it('rotation 90° + scale 180 → rendu 2.5" sur chaque axe (hypot gère la rotation)', () => {
    const { fn, args } = ops([[OPS.transform, [0, 180, -180, 0, 0, 0]], [OPS.paintImageXObject, img(300)]]);
    const out = extractImagesFromOpList(fn, args, OPS);
    expect(out[0].renderedWidthIn).toBeCloseTo(2.5, 5);
    expect(out[0].renderedHeightIn).toBeCloseTo(2.5, 5);
  });

  it('image source minuscule (<16px) → ignorée (fill/spacer, pas une photo)', () => {
    const { fn, args } = ops([[OPS.transform, [500, 0, 0, 500, 0, 0]], [OPS.paintImageXObject, img(2)]]);
    expect(extractImagesFromOpList(fn, args, OPS)).toHaveLength(0);
  });

  it('CTM dégénérée (scale 0) → ignorée (pas de division par zéro)', () => {
    const { fn, args } = ops([[OPS.transform, [0, 0, 0, 0, 100, 100]], [OPS.paintImageXObject, img(300)]]);
    expect(extractImagesFromOpList(fn, args, OPS)).toHaveLength(0);
  });

  it('image inline (paintInlineImageXObject) avec width/height', () => {
    const { fn, args } = ops([[OPS.transform, [144, 0, 0, 144, 0, 0]], [OPS.paintInlineImageXObject, [{ width: 300, height: 300 }]]]);
    const out = extractImagesFromOpList(fn, args, OPS);
    expect(out).toHaveLength(1);
    expect(out[0].renderedWidthIn).toBeCloseTo(2, 5);
  });
});

describe('computeImageDpiIssues — calcul DPI + sévérité', () => {
  const at = (pixel: number, inches: number): EmbeddedImage => ({ pixelW: pixel, pixelH: pixel, renderedWidthIn: inches, renderedHeightIn: inches });

  it('300px @ 1" = 300 DPI → aucun avertissement', () => {
    const r = computeImageDpiIssues([at(300, 1)]);
    expect(r.minDpi).toBeCloseTo(300, 0);
    expect(r.issues).toHaveLength(0);
  });

  it('300px @ 4" = 75 DPI → avertissement TRÈS basse résolution (low)', () => {
    const r = computeImageDpiIssues([at(300, 4)]);
    expect(r.minDpi).toBeCloseTo(75, 0);
    expect(r.issues[0].code).toBe('embedded-image-low-dpi');
    expect(r.issues[0].level).toBe('warning');
    expect(r.issues[0].message).toMatch(/75 DPI/);
  });

  it('300px @ 2.5" = 120 DPI → avertissement résolution réduite (soft)', () => {
    const r = computeImageDpiIssues([at(300, 2.5)]);
    expect(r.minDpi).toBeCloseTo(120, 0);
    expect(r.issues[0].code).toBe('embedded-image-soft-dpi');
  });

  it('150 DPI pile → pas d\'avertissement (seuil non strict)', () => {
    expect(computeImageDpiIssues([at(300, 2)]).issues).toHaveLength(0); // 300/2 = 150
  });

  it('plusieurs images → DPI le plus faible reporté + comptage', () => {
    const r = computeImageDpiIssues([at(300, 1), at(300, 5), at(300, 3)]); // 300, 60, 100
    expect(r.minDpi).toBeCloseTo(60, 0);
    expect(r.imageCount).toBe(3);
    expect(r.issues[0].message).toMatch(/2 images/); // 60 et 100 sont < 150
    expect(r.issues[0].code).toBe('embedded-image-low-dpi'); // 60 < 100
  });

  it('axe le plus contraignant : image non carrée prend le pire des deux', () => {
    const r = computeImageDpiIssues([{ pixelW: 1200, pixelH: 100, renderedWidthIn: 4, renderedHeightIn: 4 }]); // x=300, y=25
    expect(r.minDpi).toBeCloseTo(25, 0);
  });

  it('aucune image → résultat vide, pas d\'avertissement', () => {
    const r = computeImageDpiIssues([]);
    expect(r.minDpi).toBeNull();
    expect(r.issues).toHaveLength(0);
  });
});
