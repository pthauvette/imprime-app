import type { MetadataRoute } from 'next';

/**
 * /robots.txt — autorise les crawlers sur tout sauf les zones privées.
 *
 * Bloque /admin/*, /api/*, /orders/* (privée per-user), /settings/*,
 * /onboarding, et toutes les wizard steps qui contiennent du state user
 * dans l'URL.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.plio.ca';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/orders/',
          '/settings/',
          '/onboarding',
          '/drafts',
          '/addresses',
          '/wallet',
          '/payments',
          '/referrals',
          '/order/configure',
          '/order/quantity',
          '/order/upload',
          '/order/shipping',
          '/order/review',
          '/order/confirmation',
          '/sign-in/sent',
        ],
      },
    ],
    sitemap: `${APP_URL}/sitemap.xml`,
    host: APP_URL.replace(/^https?:\/\//, ''),
  };
}
