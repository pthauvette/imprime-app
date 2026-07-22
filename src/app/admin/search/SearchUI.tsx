'use client';

/**
 * UI live search admin. Tape > 1 char → debounced fetch /api/admin/search.
 * Résultats groupés par type avec icône + lien direct.
 */

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/components/ui/Icon';

interface ResultItem {
  type: 'order' | 'user' | 'message' | 'quote' | 'reseller';
  id: string;
  href: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

const TYPE_LABELS: Record<ResultItem['type'], { label: string; icon: IconName }> = {
  order: { label: 'Commande', icon: 'package' },
  user: { label: 'Utilisateur', icon: 'user' },
  message: { label: 'Message', icon: 'chat' },
  quote: { label: 'Devis sur-mesure', icon: 'dollar' },
  reseller: { label: 'Reseller', icon: 'target' },
};

export default function SearchUI({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();
  const [didSearch, setDidSearch] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setDidSearch(false);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        setError(null);
        try {
          const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setResults(data.results ?? []);
          setDidSearch(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erreur');
        }
      });
    }, 250); // debounce 250ms

    return () => clearTimeout(t);
  }, [q]);

  // Group by type
  const grouped = results.reduce<Record<string, ResultItem[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 920 }}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="Cherche email, nom, commande, sujet, projet…"
        style={{
          width: '100%',
          padding: '16px 20px',
          fontSize: 18,
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-md)',
          background: 'var(--bg-canvas)',
          fontFamily: 'inherit',
          marginBottom: 24,
        }}
      />

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, minHeight: 18 }}>
        {q.length < 2
          ? 'Tape au moins 2 caractères pour chercher.'
          : loading
            ? 'Recherche…'
            : didSearch
              ? `${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${q} »`
              : ''}
        {error && (
          <span style={{ color: 'var(--danger)', marginLeft: 12 }}>{error}</span>
        )}
      </div>

      {results.length === 0 && didSearch && !loading && (
        <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Aucun résultat. Essaie un terme plus précis ou plus court.
        </div>
      )}

      <div style={{ display: 'grid', gap: 24 }}>
        {(['order', 'user', 'quote', 'message', 'reseller'] as const).map((type) => {
          const items = grouped[type];
          if (!items || items.length === 0) return null;
          const meta = TYPE_LABELS[type];
          return (
            <section key={type}>
              <h2
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  margin: '0 0 8px',
                }}
              >
                <Icon name={meta.icon} size={14} /> {meta.label} <span style={{ marginLeft: 6 }}>({items.length})</span>
              </h2>
              <div className="adm-panel" style={{ padding: 0, overflow: 'hidden' }}>
                {items.map((r, i) => (
                  <Link
                    key={r.id}
                    href={r.href as never}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 12,
                      padding: '14px 18px',
                      borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>
                        {highlight(r.primary, q)}
                      </div>
                      {r.secondary && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {highlight(r.secondary, q)}
                        </div>
                      )}
                    </div>
                    {r.meta && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', whiteSpace: 'nowrap' }}>
                        {r.meta}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Highlight matching substring (case-insensitive). Naive — pas regex-safe
 *  pour les caractères spéciaux, mais OK pour search admin où le contenu est
 *  text simple. */
function highlight(text: string, query: string): React.ReactNode {
  if (query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent-soft)', color: 'var(--accent-primary)', padding: '0 2px', borderRadius: 2 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
