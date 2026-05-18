/**
 * /blog/[slug] — page d'un article de blog.
 *
 * Render le component Post depuis le registry. generateStaticParams pour
 * SSG sur tous les slugs. JSON-LD BlogPosting + BreadcrumbList pour SEO.
 *
 * Le component Post est défini en src/content/blog/<slug>.tsx — pas de
 * markdown runtime, juste du JSX (typescript-safe + on peut utiliser des
 * composants Plio comme CTA inline).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getPostBySlug, formatPostDate } from '@/lib/blog/posts';
import JsonLd, { breadcrumbSchema } from '@/components/seo/JsonLd';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.meta.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: 'Article introuvable — Plio' };
  return {
    title: `${post.meta.title} — Blog Plio`,
    description: post.meta.excerpt,
    openGraph: {
      title: post.meta.title,
      description: post.meta.excerpt,
      type: 'article',
      publishedTime: post.meta.date,
      authors: [post.meta.author],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { meta, Component } = post;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://plio.ca';
  const allPosts = getAllPosts();
  const otherPosts = allPosts.filter((p) => p.meta.slug !== meta.slug).slice(0, 2);

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: meta.title,
          description: meta.excerpt,
          datePublished: meta.date,
          dateModified: meta.date,
          author: { '@type': 'Organization', name: meta.author, url: baseUrl },
          publisher: {
            '@type': 'Organization',
            name: 'Plio',
            logo: { '@type': 'ImageObject', url: `${baseUrl}/logo.png` },
          },
          mainEntityOfPage: { '@type': 'WebPage', '@id': `${baseUrl}/blog/${meta.slug}` },
        }}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Accueil', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: meta.title, path: `/blog/${meta.slug}` },
        ])}
      />

      <article className="blog-shell">
        <nav className="blog-breadcrumb">
          <Link href={'/' as Route}>Accueil</Link>
          <span aria-hidden>›</span>
          <Link href={'/blog' as Route}>Blog</Link>
        </nav>

        <header className="blog-article-header">
          <div className="blog-article-meta">
            <time dateTime={meta.date}>{formatPostDate(meta.date)}</time>
            {meta.readingMinutes && (
              <>
                <span>·</span>
                <span>{meta.readingMinutes} min lecture</span>
              </>
            )}
            <span>·</span>
            <span>{meta.author}</span>
          </div>
          <h1 className="blog-article-title">{meta.title}</h1>
          <p className="blog-article-excerpt">{meta.excerpt}</p>
        </header>

        <div className="blog-article-body">
          <Component />
        </div>

        {meta.tags && meta.tags.length > 0 && (
          <div className="blog-article-tags">
            {meta.tags.map((t) => (
              <span key={t} className="blog-card-tag">#{t}</span>
            ))}
          </div>
        )}

        {otherPosts.length > 0 && (
          <aside className="blog-related">
            <h2 className="blog-related-title">À lire aussi</h2>
            <div className="blog-list">
              {otherPosts.map((p) => (
                <Link
                  key={p.meta.slug}
                  href={`/blog/${p.meta.slug}` as Route}
                  className="blog-card"
                >
                  <div className="blog-card-meta">
                    <time dateTime={p.meta.date}>{formatPostDate(p.meta.date)}</time>
                  </div>
                  <h3 className="blog-card-title">{p.meta.title}</h3>
                  <p className="blog-card-excerpt">{p.meta.excerpt}</p>
                  <div className="blog-card-cta">Lire →</div>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </article>
    </>
  );
}
