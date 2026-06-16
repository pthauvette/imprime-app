import { describe, it, expect } from 'vitest';
import { parseSizeLabel, resolveSelectedSize } from './parse-size';

describe('parseSizeLabel', () => {
  it('formats simples "W x H"', () => {
    expect(parseSizeLabel('3.5 x 2')).toEqual({ widthIn: 3.5, heightIn: 2 });
    expect(parseSizeLabel('6 x 9')).toEqual({ widthIn: 6, heightIn: 9 });
    expect(parseSizeLabel('5.25 x 10.5')).toEqual({ widthIn: 5.25, heightIn: 10.5 });
  });
  it('prend le 1er « W x H » même avec du texte en plus', () => {
    expect(parseSizeLabel('9 x 12 - 3 inch Pocket')).toEqual({ widthIn: 9, heightIn: 12 });
    expect(parseSizeLabel('9 x 14.5 - 4 inch Pocket')).toEqual({ widthIn: 9, heightIn: 14.5 });
  });
  it('× unicode + espaces variables', () => {
    expect(parseSizeLabel('3.5×2')).toEqual({ widthIn: 3.5, heightIn: 2 });
    expect(parseSizeLabel('  4  x  6 ')).toEqual({ widthIn: 4, heightIn: 6 });
  });
  it('rejette le non-parsable et le métrique mal interprété → null (= fallback warning)', () => {
    expect(parseSizeLabel('210 x 297')).toBeNull(); // A4 en mm → hors plage pouces
    expect(parseSizeLabel('Custom')).toBeNull();
    expect(parseSizeLabel('A4')).toBeNull();
    expect(parseSizeLabel('')).toBeNull();
    expect(parseSizeLabel(null)).toBeNull();
    expect(parseSizeLabel(undefined)).toBeNull();
  });
  it('rejette hors plage de plausibilité (0.5–60")', () => {
    expect(parseSizeLabel('0.1 x 2')).toBeNull();
    expect(parseSizeLabel('100 x 2')).toBeNull();
  });
});

describe('resolveSelectedSize', () => {
  const sizeGroup = [
    { id: 101, name: '3.5 x 2' },
    { id: 102, name: '4 x 6' },
  ];
  it('matche l\'ID sélectionné dans le groupe size → parse', () => {
    expect(resolveSelectedSize(sizeGroup, [999, 102, 5])).toEqual({ widthIn: 4, heightIn: 6 });
  });
  it('aucun ID size sélectionné → null', () => {
    expect(resolveSelectedSize(sizeGroup, [1, 2, 3])).toBeNull();
  });
  it('groupe absent ou vide → null', () => {
    expect(resolveSelectedSize(undefined, [101])).toBeNull();
    expect(resolveSelectedSize([], [101])).toBeNull();
  });
});
