/**
 * Tests pour /sitemap.xml et /robots.txt — lock-in les invariants SEO.
 *
 * Round 22 #5. Discovery : les 2 fichiers existaient déjà. Ce PR ajoute
 * les tests pour les protéger des regressions silencieuses :
 *   - Page publique enlevée du sitemap accidentellement
 *   - Page privée ajoutée au sitemap (data leak)
 *   - Robots disallow qui couvrirait des paths publics
 *
 * On mock @/lib/blog/posts + @/lib/templates/registry pour fixer
 * les inputs (sinon les tests cassent quand on ajoute un post ou un template).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/blog/posts', () => ({
  getAllPosts: () => [
    { meta: { slug: 'test-post-1', date: '2026-01-01' } },
    { meta: { slug: 'test-post-2', date: '2026-02-01' } },
  ],
}));

vi.mock('@/lib/templates/registry', () => ({
  ALL_TEMPLATES: [
    { slug: 'cartes-biz' },
    { slug: 'flyers' },
  ],
}));

describe('sitemap.xml', () => {
  it('inclut les routes publiques clés (anti-régression)', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    // Routes critiques pour SEO — si une de celles-ci disparait, le SEO crash
    const mustHave = [
      '/',
      '/blog',
      '/pricing',
      '/about',
      '/contact',
      '/help',
      '/reseller',
      '/quote',
      '/legal/terms',
      '/legal/privacy',
      '/legal/refund-policy',
    ];
    for (const path of mustHave) {
      expect(urls.some((u) => u.endsWith(path)), `${path} doit être dans sitemap`).toBe(true);
    }
  });

  it('inclut blog posts du mock', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes('/blog/test-post-1'))).toBe(true);
    expect(urls.some((u) => u.includes('/blog/test-post-2'))).toBe(true);
  });

  it('EXCLUT /templates — passée derrière le compte (2026-08)', async () => {
    // Le sitemap ne doit pas annoncer une URL qui répond 307 vers la connexion.
    // Ce test remplace l'entrée anti-régression inverse : c'est maintenant la
    // PRÉSENCE de /templates qui serait la régression.
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith('/templates'))).toBe(false);
  });

  it('inclut templates design via /design/[slug] — l’acquisition reste indexée', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.includes('/design/cartes-biz'))).toBe(true);
    expect(urls.some((u) => u.includes('/design/flyers'))).toBe(true);
  });

  it('NE PAS inclure routes privées (anti data-leak)', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    const urls = entries.map((e) => e.url);

    const mustNotHave = [
      '/admin',
      '/api/',
      '/account',
      '/orders/',
      '/settings',
      '/wallet',
    ];
    for (const path of mustNotHave) {
      expect(urls.some((u) => u.includes(path)), `${path} ne doit PAS être dans sitemap`).toBe(false);
    }
  });

  it('home page a priority 1.0 (toujours top)', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    const home = entries.find((e) => e.url.match(/\/$/) || e.url.endsWith('plio.ca'));
    expect(home?.priority).toBe(1.0);
  });

  it('toutes les entries ont les champs requis', async () => {
    const sitemap = (await import('@/app/sitemap')).default;
    const entries = await sitemap();
    for (const e of entries) {
      expect(e.url).toMatch(/^https?:\/\//);
      expect(e.lastModified).toBeDefined();
    }
  });
});

describe('robots.txt', () => {
  it('disallow les routes admin / api / private', async () => {
    const robots = (await import('@/app/robots')).default;
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const disallow = (rule?.disallow as string[]) ?? [];

    expect(disallow).toContain('/admin/');
    expect(disallow).toContain('/api/');
    expect(disallow).toContain('/orders/');
    expect(disallow).toContain('/settings/');
  });

  it('allow / (root)', async () => {
    const robots = (await import('@/app/robots')).default;
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.allow).toBe('/');
  });

  it('sitemap link présent', async () => {
    const robots = (await import('@/app/robots')).default;
    const r = robots();
    expect(r.sitemap).toBeDefined();
    expect(r.sitemap).toContain('sitemap.xml');
  });

  it('NE PAS disallow les wizard entry points (/order/start, /order/product)', async () => {
    const robots = (await import('@/app/robots')).default;
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const disallow = (rule?.disallow as string[]) ?? [];

    // Les entry points doivent rester crawlables (deep links possibles)
    expect(disallow).not.toContain('/order/start');
    expect(disallow).not.toContain('/order/product');
    expect(disallow).not.toContain('/');
  });
});
