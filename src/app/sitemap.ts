import type { MetadataRoute } from 'next';
import { ALL_TEMPLATES } from '@/lib/templates/registry';
import { getAllPosts } from '@/lib/blog/posts';
import { getTopProductIds, buildPairs } from '@/lib/seo/compare-pairs';

/**
 * Sitemap dynamique servi à https://www.plio.ca/sitemap.xml
 *
 * Inclut les pages publiques + 1 entry par template (pour que Google index
 * /design/[slug]) + Round 35 : paires /compare?ids=A,B top-10 produits
 * (long-tail SEO). Exclut les pages account-only (orders, admin, etc.).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.plio.ca';

const STATIC_PUBLIC_ROUTES = [
  { path: '/', priority: 1.0, changeFreq: 'weekly' as const },
  { path: '/blog', priority: 0.9, changeFreq: 'weekly' as const },
  { path: '/templates', priority: 0.9, changeFreq: 'weekly' as const },
  { path: '/pricing', priority: 0.8, changeFreq: 'monthly' as const },
  { path: '/about', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/contact', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/help', priority: 0.6, changeFreq: 'monthly' as const },
  { path: '/search', priority: 0.4, changeFreq: 'monthly' as const },
  { path: '/status', priority: 0.4, changeFreq: 'daily' as const },
  { path: '/samples', priority: 0.6, changeFreq: 'monthly' as const },
  { path: '/reseller', priority: 0.6, changeFreq: 'monthly' as const },
  // Round 29 #5 — content marketing pour resellers (pricing, acquisition, fidélisation)
  { path: '/reseller/guide', priority: 0.5, changeFreq: 'monthly' as const },
  { path: '/quote', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/track', priority: 0.5, changeFreq: 'monthly' as const },
  // Round 29 #3 — landing pour /compare?ids=... (vide = empty state CTA)
  { path: '/compare', priority: 0.4, changeFreq: 'monthly' as const },
  { path: '/legal/terms', priority: 0.3, changeFreq: 'yearly' as const },
  { path: '/legal/privacy', priority: 0.3, changeFreq: 'yearly' as const },
  { path: '/legal/refund-policy', priority: 0.3, changeFreq: 'yearly' as const },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PUBLIC_ROUTES.map((r) => ({
    url: `${APP_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFreq,
    priority: r.priority,
  }));

  const templateEntries: MetadataRoute.Sitemap = ALL_TEMPLATES.map((t) => ({
    url: `${APP_URL}/design/${t.slug}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  // Blog posts : 1 entry par post. lastModified = date du post (proxy
  // pour rafraîchissement réel — on bumpera quand on éditera un article).
  const blogEntries: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${APP_URL}/blog/${p.meta.slug}`,
    lastModified: new Date(p.meta.date),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Round 35 — Long-tail SEO : générer /compare?ids=A,B pour toutes les
  // paires des top-10 produits commandés sur les 90 derniers jours.
  // Pour 10 produits → 45 URLs. Si DB échoue, retourne [] (graceful).
  const topProductIds = await getTopProductIds();
  const comparePairs = buildPairs(topProductIds);
  const compareEntries: MetadataRoute.Sitemap = comparePairs.map(([a, b]) => ({
    url: `${APP_URL}/compare?ids=${a},${b}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.4, // < templates (0.8) car page comparative dérivée
  }));

  return [...staticEntries, ...templateEntries, ...blogEntries, ...compareEntries];
}
