import type { MetadataRoute } from 'next';
import { ALL_TEMPLATES } from '@/lib/templates/registry';

/**
 * Sitemap dynamique servi à https://www.plio.ca/sitemap.xml
 *
 * Inclut les pages publiques + 1 entry par template (pour que Google index
 * /design/[slug]). Exclut les pages account-only (orders, admin, etc.).
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.plio.ca';

const STATIC_PUBLIC_ROUTES = [
  { path: '/', priority: 1.0, changeFreq: 'weekly' as const },
  { path: '/templates', priority: 0.9, changeFreq: 'weekly' as const },
  { path: '/pricing', priority: 0.8, changeFreq: 'monthly' as const },
  { path: '/about', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/contact', priority: 0.7, changeFreq: 'monthly' as const },
  { path: '/help', priority: 0.6, changeFreq: 'monthly' as const },
  { path: '/samples', priority: 0.6, changeFreq: 'monthly' as const },
  { path: '/reseller', priority: 0.6, changeFreq: 'monthly' as const },
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

  return [...staticEntries, ...templateEntries];
}
