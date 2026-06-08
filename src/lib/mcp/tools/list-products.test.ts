import { describe, it, expect } from 'vitest';
import { listPrintProducts, formatProductsText } from './list-products';

describe('MCP tool — list_print_products', () => {
  it('retourne un catalogue non vide de produits curatés', () => {
    const products = listPrintProducts();
    expect(products.length).toBeGreaterThan(0);
    // Carte de visite = produit phare, doit être présent.
    const cdv = products.find((p) => p.slug === 'cartes-de-visite');
    expect(cdv).toBeDefined();
    expect(cdv?.name).toMatch(/carte/i);
  });

  it('chaque produit a slug, name, description et ≥1 papier', () => {
    for (const p of listPrintProducts()) {
      expect(p.slug).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.papers.length).toBeGreaterThan(0);
      for (const paper of p.papers) {
        expect(paper.key).toBeTruthy();
        expect(paper.label).toBeTruthy();
        expect(typeof paper.specialty).toBe('boolean');
      }
    }
  });

  it('expose le flag specialty (kraft = spécialité sur les cartes de visite)', () => {
    const cdv = listPrintProducts().find((p) => p.slug === 'cartes-de-visite');
    const kraft = cdv?.papers.find((pp) => pp.key === 'kraft');
    expect(kraft?.specialty).toBe(true);
    const std = cdv?.papers.find((pp) => pp.key === '14pt');
    expect(std?.specialty).toBe(false);
  });

  it('formatProductsText rend un Markdown avec noms, slugs et clés papier', () => {
    const text = formatProductsText(listPrintProducts());
    expect(text).toContain('cartes-de-visite');
    expect(text).toContain('get_print_quote'); // pointe vers le tool suivant
    expect(text).toMatch(/Papiers/);
    // Pas de slug vide / undefined qui fuiterait dans le rendu.
    expect(text).not.toContain('undefined');
  });
});
