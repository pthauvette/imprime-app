/**
 * GET /api/search?q=string
 *
 * Recherche publique customer — match dans :
 *   - Help FAQ items (src/data/help-faq.ts)
 *   - Blog posts (src/lib/blog/posts.ts)
 *
 * Pas de produit Sinalite (catalogue dynamique, search côté SinaliteWizard
 * fait plus de sens). Pas de rate limit pour MVP (search publique safe,
 * pas de DB hit).
 */

import { NextResponse } from 'next/server';
import { FAQ_ITEMS } from '@/data/help-faq';
import { getAllPosts } from '@/lib/blog/posts';
import { faqSlug } from '@/lib/help/faq-slug';

interface ResultItem {
  type: 'faq' | 'blog';
  href: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

const MAX_PER_TYPE = 10;

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[\s\W]+/).filter((w) => w.length >= 2);
}

function scoreMatch(query: string, text: string): number {
  if (!text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) {
    // Boost si match exact (en début de mot, en titre, etc.)
    return t.indexOf(q) === 0 ? 100 : 50;
  }
  // Score par token (combien de mots de la query apparaissent dans text)
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;
  let matches = 0;
  for (const tok of queryTokens) {
    if (t.includes(tok)) matches++;
  }
  return matches > 0 ? Math.round((matches / queryTokens.length) * 30) : 0;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ ok: true, q, results: [], count: 0 });
  }

  const results: Array<ResultItem & { score: number }> = [];

  // FAQ search
  for (const item of FAQ_ITEMS) {
    const qScore = scoreMatch(q, item.q) * 2; // boost match dans question
    const aScore = scoreMatch(q, item.a);
    const total = qScore + aScore;
    if (total > 0) {
      results.push({
        type: 'faq',
        href: `/help#${faqSlug(item.q)}`,
        primary: item.q,
        secondary: item.a.slice(0, 140),
        meta: item.category,
        score: total,
      });
    }
  }

  // Blog search
  const posts = getAllPosts();
  for (const post of posts) {
    const titleScore = scoreMatch(q, post.meta.title) * 2;
    const excerptScore = scoreMatch(q, post.meta.excerpt);
    const tagsScore = (post.meta.tags ?? []).reduce((sum, t) => sum + scoreMatch(q, t), 0);
    const total = titleScore + excerptScore + tagsScore;
    if (total > 0) {
      results.push({
        type: 'blog',
        href: `/blog/${post.meta.slug}`,
        primary: post.meta.title,
        secondary: post.meta.excerpt,
        meta: post.meta.tags?.[0] ?? 'Article',
        score: total,
      });
    }
  }

  // Sort by score desc, then keep top MAX_PER_TYPE per type
  results.sort((a, b) => b.score - a.score);
  const byType: Record<string, ResultItem[]> = { faq: [], blog: [] };
  for (const r of results) {
    if (byType[r.type].length < MAX_PER_TYPE) {
      const { score: _score, ...rest } = r;
      void _score;
      byType[r.type].push(rest);
    }
  }

  // Interleave so the top results are visible across types
  const interleaved: ResultItem[] = [];
  const maxLen = Math.max(byType.faq.length, byType.blog.length);
  for (let i = 0; i < maxLen; i++) {
    if (byType.faq[i]) interleaved.push(byType.faq[i]);
    if (byType.blog[i]) interleaved.push(byType.blog[i]);
  }

  return NextResponse.json({
    ok: true,
    q,
    results: interleaved,
    count: interleaved.length,
  });
}

