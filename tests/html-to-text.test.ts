/**
 * Tests pour htmlToPlainText — finding [113].
 *
 * Lock-in :
 *   - un lien <a href> devient « texte (URL) » — l'URL n'est jamais perdue
 *   - les tags restants sont bien strippés
 *   - le plafond (5000) protège contre un HTML pathologique SANS tronquer
 *     un courriel réel de routine
 */

import { describe, it, expect } from 'vitest';
import { htmlToPlainText } from '@/lib/emails/html-to-text';

describe('htmlToPlainText', () => {
  it('préserve l\'URL d\'un lien : "texte (URL)"', () => {
    const html = '<p>Clique <a href="https://plio.ca/track?orderId=1">ici</a> pour suivre.</p>';
    const text = htmlToPlainText(html);
    expect(text).toContain('ici (https://plio.ca/track?orderId=1)');
  });

  it('lien sans texte visible distinct (label == href) → pas de doublon', () => {
    const html = '<a href="https://plio.ca">https://plio.ca</a>';
    const text = htmlToPlainText(html);
    expect(text).toBe('https://plio.ca');
  });

  it('strip les tags non-lien restants', () => {
    const html = '<div><strong>Bonjour</strong> <em>Sophie</em></div>';
    expect(htmlToPlainText(html)).toBe('Bonjour Sophie');
  });

  it('collapse les espaces multiples / retours à la ligne', () => {
    const html = '<p>Ligne 1</p>\n\n  <p>Ligne   2</p>';
    expect(htmlToPlainText(html)).toBe('Ligne 1 Ligne 2');
  });

  it('plusieurs liens dans le même courriel — tous préservés', () => {
    const html = '<a href="https://plio.ca/a">A</a> et <a href="https://plio.ca/b">B</a>';
    const text = htmlToPlainText(html);
    expect(text).toContain('A (https://plio.ca/a)');
    expect(text).toContain('B (https://plio.ca/b)');
  });

  it('un courriel réel (~2000 caractères de HTML) n\'est PAS tronqué', () => {
    const filler = '<p>' + 'Lorem ipsum dolor sit amet. '.repeat(60) + '</p>'; // ~1700 chars HTML
    const html = `${filler}<a href="https://plio.ca/orders/abc123">Voir ma commande</a>`;
    const text = htmlToPlainText(html);
    expect(text).toContain('Voir ma commande (https://plio.ca/orders/abc123)');
  });

  it('HTML pathologiquement long (>5000 car. de texte réel) → plafonné, pas de crash', () => {
    const html = '<p>' + 'x'.repeat(10000) + '</p>';
    const text = htmlToPlainText(html);
    expect(text.length).toBeLessThanOrEqual(5000);
  });
});
