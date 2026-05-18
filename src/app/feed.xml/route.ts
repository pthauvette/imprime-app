/**
 * GET /feed.xml — RSS 2.0 du blog Plio.
 *
 * Permet aux lecteurs RSS (Feedly, NetNewsWire, etc.) + Google Discover de
 * suivre les nouveaux articles. Pas de full body dans le feed (juste excerpt)
 * pour pousser le clic vers le site (analytics + conversion).
 *
 * Cache 1h via Cache-Control max-age (les posts changent rarement).
 */

import { getAllPosts, formatPostDate } from '@/lib/blog/posts';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.plio.ca';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const posts = getAllPosts();
  const buildDate = new Date().toUTCString();

  const items = posts
    .map((p) => {
      const url = `${APP_URL}/blog/${p.meta.slug}`;
      const pubDate = new Date(p.meta.date).toUTCString();
      return `    <item>
      <title>${escapeXml(p.meta.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(p.meta.excerpt)}</description>
      <author>noreply@plio.ca (${escapeXml(p.meta.author)})</author>
      ${p.meta.tags?.map((t) => `<category>${escapeXml(t)}</category>`).join('\n      ') ?? ''}
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Blog Plio — guides d'impression au Canada</title>
    <link>${APP_URL}/blog</link>
    <description>Conseils pratiques pour bien imprimer ses cartes de visite, flyers, brochures au Canada.</description>
    <language>fr-CA</language>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${APP_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
