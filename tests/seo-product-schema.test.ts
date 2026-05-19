/**
 * Tests pour productSchema + itemListSchema (Round 12 #4).
 *
 * Le but : s'assurer que les rich snippets Schema.org ne contiennent pas
 * de undefined / champs obligatoires manquants, et que les prix sont
 * formatés correctement pour Google.
 */

import { describe, it, expect } from 'vitest';
import { productSchema, itemListSchema, breadcrumbSchema } from '@/components/seo/schemas';

describe('productSchema', () => {
  it('inclut les champs obligatoires Schema.org Product', () => {
    const s = productSchema({
      id: 42,
      name: 'Cartes 14pt UV',
      sku: 'BC-14UV',
      category: 'Business Cards',
      pageUrl: '/order/configure?productId=42',
    });
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toBe('Product');
    expect(s.name).toBe('Cartes 14pt UV');
    expect(s.productID).toBe('42');
    expect(s.sku).toBe('BC-14UV');
    expect(s.brand).toEqual(
      expect.objectContaining({ '@type': 'Brand', name: 'Plio' }),
    );
  });

  it('génère AggregateOffer si priceCents fourni', () => {
    const s = productSchema({
      id: 1, name: 'X', pageUrl: '/x',
      priceCents: { low: 1500, high: 9999 },
    });
    expect(s.offers).toBeDefined();
    expect(s.offers).toEqual(expect.objectContaining({
      '@type': 'AggregateOffer',
      priceCurrency: 'CAD',
      lowPrice: '15.00',
      highPrice: '99.99',
      availability: 'https://schema.org/InStock',
    }));
  });

  it('omet offers si priceCents null ou high=0', () => {
    const s1 = productSchema({ id: 1, name: 'X', pageUrl: '/x', priceCents: null });
    expect(s1.offers).toBeUndefined();
    const s2 = productSchema({ id: 1, name: 'X', pageUrl: '/x', priceCents: { low: 0, high: 0 } });
    expect(s2.offers).toBeUndefined();
  });

  it('omet description/sku/category quand pas fournis', () => {
    const s = productSchema({ id: 1, name: 'X', pageUrl: '/x' });
    expect(s.description).toBeUndefined();
    expect(s.sku).toBeUndefined();
    expect(s.category).toBeUndefined();
    // image fallback toujours présent (OG image générique)
    expect(s.image).toBeTruthy();
  });

  it('URL absolue préservée, relative préfixée par APP_URL', () => {
    const s1 = productSchema({ id: 1, name: 'X', pageUrl: '/order/configure?productId=1' });
    expect(s1.url).toMatch(/^https?:\/\/.+\/order\/configure\?productId=1$/);
    const s2 = productSchema({ id: 1, name: 'X', pageUrl: 'https://other.com/p/1' });
    expect(s2.url).toBe('https://other.com/p/1');
  });
});

describe('itemListSchema', () => {
  it('génère un ItemList avec positions 1-indexées', () => {
    const s = itemListSchema([
      { name: 'Produit A', path: '/order/configure?productId=1' },
      { name: 'Produit B', path: '/order/configure?productId=2' },
    ]);
    expect(s['@type']).toBe('ItemList');
    expect(s.numberOfItems).toBe(2);
    const items = s.itemListElement as Array<{ position: number; name: string }>;
    expect(items[0]!.position).toBe(1);
    expect(items[0]!.name).toBe('Produit A');
    expect(items[1]!.position).toBe(2);
  });

  it('liste vide → numberOfItems 0', () => {
    const s = itemListSchema([]);
    expect(s.numberOfItems).toBe(0);
    expect((s.itemListElement as unknown[]).length).toBe(0);
  });
});

describe('breadcrumbSchema (regression)', () => {
  it('génère BreadcrumbList valide', () => {
    const s = breadcrumbSchema([
      { name: 'Accueil', path: '/' },
      { name: 'Cartes', path: '/order/product?category=cartes' },
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    const items = s.itemListElement as Array<{ position: number }>;
    expect(items.length).toBe(2);
    expect(items[0]!.position).toBe(1);
  });
});
