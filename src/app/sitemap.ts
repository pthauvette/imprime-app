import type { MetadataRoute } from 'next';
import { ALL_TEMPLATES } from '@/lib/templates/registry';
import { getAllPosts } from '@/lib/blog/posts';

/**
 * Sitemap dynamique servi à https://www.plio.ca/sitemap.xml
 *
 * Inclut les pages publiques + 1 entry par template (pour que Google index
 * /design/[slug]). Exclut les pages account-only (orders, admin, etc.).
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
  { path: '/status', priority: 0.4, changeFreq: 'daily' as const },
  { path: '/samples', priority: 0.6, changeFreq: 'monthly' as const },
  { path: '/reseller', priority: 0.6, changeFreq: 'monthly' as const },
  { path: '/quote', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/legal/terms', priority: 0.3, changeFreq: 'yearly' as const },
  { path: '/legal/privacy', priority: 0.3, changeFreq: 'yearly' as const },
  { path: '/legal/refund-policy', priority: 0.3, changeFreq: 'yearly' as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
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

  return [...staticEntries, ...templateEntries, ...blogEntries];
}
