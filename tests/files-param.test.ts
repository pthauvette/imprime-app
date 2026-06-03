/**
 * files-param — Audit v2 #4.3.
 *
 * Build (upload→shipping) + parse (réhydratation upload sur « Précédent »).
 * Verrouille : round-trip stable, format compatible avec le parsing de
 * /order/review (`<type>:<encodeURIComponent(url)>` joints par '|').
 */

import { describe, it, expect } from 'vitest';
import { buildFilesParam, parseFilesParam } from '@/lib/order/files-param';

describe('buildFilesParam', () => {
  it('front + back → "front:..|back:.." (délimiteur pipe, URL encodée)', () => {
    const p = buildFilesParam('https://s3/a b.pdf', 'https://s3/back.pdf');
    expect(p).toBe(`front:${encodeURIComponent('https://s3/a b.pdf')}|back:${encodeURIComponent('https://s3/back.pdf')}`);
  });

  it('recto seul → pas de segment back', () => {
    expect(buildFilesParam('https://s3/front.pdf', null)).toBe(`front:${encodeURIComponent('https://s3/front.pdf')}`);
  });

  it('aucun fichier → chaîne vide', () => {
    expect(buildFilesParam(null, null)).toBe('');
    expect(buildFilesParam(undefined, undefined)).toBe('');
  });
});

describe('parseFilesParam', () => {
  it('parse front + back, décode les URLs', () => {
    const raw = buildFilesParam('https://s3/a b.pdf', 'https://s3/back.pdf');
    expect(parseFilesParam(raw)).toEqual({
      frontUrl: 'https://s3/a b.pdf',
      backUrl: 'https://s3/back.pdf',
    });
  });

  it('vide / null → objet vide', () => {
    expect(parseFilesParam('')).toEqual({});
    expect(parseFilesParam(null)).toEqual({});
    expect(parseFilesParam(undefined)).toEqual({});
  });

  it('round-trip stable (build → parse → mêmes URLs)', () => {
    const front = 'https://s3.amazonaws.com/bucket/design v2 (final).pdf?sig=abc';
    const back = 'https://s3/verso.pdf';
    expect(parseFilesParam(buildFilesParam(front, back))).toEqual({ frontUrl: front, backUrl: back });
  });

  it('URL contenant un ":" (https) → coupe au PREMIER ":" seulement', () => {
    // le type est avant le 1er ':', l'URL (avec son https://) après
    const parsed = parseFilesParam(buildFilesParam('https://s3/x.pdf', null));
    expect(parsed.frontUrl).toBe('https://s3/x.pdf');
  });

  it('compat format /order/review : segments "type:encURL" joints par |', () => {
    // reproduit exactement ce que review parse
    const raw = `front:${encodeURIComponent('https://s3/f.pdf')}|back:${encodeURIComponent('https://s3/b.pdf')}`;
    const reviewParsed = raw.split('|').filter(Boolean).map((f) => {
      const idx = f.indexOf(':');
      return { type: f.slice(0, idx), url: decodeURIComponent(f.slice(idx + 1)) };
    });
    const ours = parseFilesParam(raw);
    expect(reviewParsed).toEqual([
      { type: 'front', url: ours.frontUrl },
      { type: 'back', url: ours.backUrl },
    ]);
  });
});
