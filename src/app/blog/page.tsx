/**
 * /blog — landing page de la section blog.
 *
 * Liste tous les posts (registry dans lib/blog/posts), tri date desc,
 * card par post avec titre + excerpt + meta (date, reading time, tags).
 *
 * SEO :
 *  - Title + description optimisés pour "blog impression Plio"
 *  - JSON-LD CollectionPage + ItemList des posts
 *  - Sitemap auto-inclus via src/app/sitemap.ts
 */

import Link from 'next/link';
import type { Route } from 'next';
import { getAllPosts, formatPostDate } from '@/lib/blog/posts';
import JsonLd from '@/components/seo/JsonLd';

export const metadata = {
  title: 'Blog Plio — guides d\'impression au Canada',
  description:
    'Guides pratiques pour bien imprimer ses cartes de visite, flyers, brochures : papiers, formats, quantités, finitions. Conseils d\'experts au Canada.',
  openGraph: {
    title: 'Blog Plio',
    description: 'Guides pratiques pour bien imprimer au Canada.',
    type: 'website',
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'Blog Plio',
          url: `${baseUrl}/blog`,
          description: 'Guides d\'impression au Canada',
          blogPost: posts.map((p) => ({
            '@type': 'BlogPosting',
            headline: p.meta.title,
            url: `${baseUrl}/blog/${p.meta.slug}`,
            datePublished: p.meta.date,
            author: { '@type': 'Organization', name: p.meta.author },
          })),
        }}
      />

      <div className="blog-shell">
        <header className="blog-header">
          <div className="blog-eyebrow">Blog Plio</div>
          <h1 className="blog-h1">
            Guides d&apos;<em>impression.</em>
          </h1>
          <p className="blog-lede">
            Comment choisir le bon papier, la bonne quantité, le bon format. Les ressources
            qu&apos;on aurait aimé avoir quand on a commencé.
          </p>
        </header>

        <div className="blog-list">
          {posts.map((p) => (
            <Link
              key={p.meta.slug}
              href={`/blog/${p.meta.slug}` as Route}
              className="blog-card"
            >
              <div className="blog-card-meta">
                <time dateTime={p.meta.date}>{formatPostDate(p.meta.date)}</time>
                {p.meta.readingMinutes && (
                  <>
                    <span>·</span>
                    <span>{p.meta.readingMinutes} min lecture</span>
                  </>
                )}
              </div>
              <h2 className="blog-card-title">{p.meta.title}</h2>
              <p className="blog-card-excerpt">{p.meta.excerpt}</p>
              {p.meta.tags && p.meta.tags.length > 0 && (
                <div className="blog-card-tags">
                  {p.meta.tags.map((t) => (
                    <span key={t} className="blog-card-tag">#{t}</span>
                  ))}
                </div>
              )}
              <div className="blog-card-cta">Lire l&apos;article →</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
