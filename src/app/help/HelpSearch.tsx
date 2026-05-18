'use client';

/**
 * Client search + filter pour /help. Filtre la FAQ par catégorie ET texte
 * libre (matching case-insensitive sur question + answer). Tout in-memory,
 * pas de network call. Pour le scale (>100 Q&A) on ferait full-text DB.
 */

import { useState, useMemo } from 'react';

export interface FaqItem {
  category: string;
  q: string;
  a: string;
}

export default function HelpSearch({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) set.add(i.category);
    return Array.from(set);
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (activeCategory && i.category !== activeCategory) return false;
      if (!q) return true;
      return i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q);
    });
  }, [items, query, activeCategory]);

  // Group filtered par category
  const byCategory = useMemo(() => {
    const m = new Map<string, FaqItem[]>();
    for (const item of filtered) {
      const list = m.get(item.category) ?? [];
      list.push(item);
      m.set(item.category, list);
    }
    return m;
  }, [filtered]);

  return (
    <>
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cherche une question…"
          aria-label="Recherche dans le centre d'aide"
          style={{
            width: '100%',
            padding: '14px 48px 14px 16px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-pill)',
            fontSize: 15,
            font: 'inherit',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: 18,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
            color: 'var(--text-muted)',
          }}
        >
          🔍
        </span>
      </div>

      {/* Category pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => setActiveCategory(null)}
          style={pillStyle(activeCategory === null)}
        >
          Tous
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCategory(c)}
            style={pillStyle(activeCategory === c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--r-lg)',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🤔</div>
          <p style={{ fontSize: 14, margin: 0 }}>
            Aucune réponse pour &laquo; {query || activeCategory} &raquo;.<br />
            <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>Écris-nous direct</a> — on te répond et on ajoute la Q&amp;A.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 24 }}>
          {Array.from(byCategory.entries()).map(([cat, list]) => (
            <section key={cat}>
              <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: 8 }}>
                {cat} <span style={{ color: 'var(--text-muted)' }}>· {list.length}</span>
              </h2>
              <div style={{ display: 'grid', gap: 6 }}>
                {list.map((item) => (
                  <details
                    key={item.q}
                    style={{
                      padding: '14px 18px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <summary style={{ cursor: 'pointer', fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{item.q}</span>
                      <span aria-hidden style={{ color: 'var(--text-muted)', fontSize: 14 }}>+</span>
                    </summary>
                    <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
    fontWeight: 600,
    background: active ? 'var(--accent-primary)' : 'var(--bg-surface)',
    color: active ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
    border: '1px solid',
    borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
    borderRadius: 'var(--r-pill)',
    cursor: 'pointer',
  };
}
