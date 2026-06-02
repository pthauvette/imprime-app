'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ResultItem {
  type: 'faq' | 'blog';
  href: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

const TYPE_INFO: Record<ResultItem['type'], { label: string; icon: string }> = {
  faq: { label: 'Aide', icon: '💡' },
  blog: { label: 'Blog', icon: '📝' },
};

export default function SearchClient({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [didSearch, setDidSearch] = useState(false);
  // Round 6 #5 — état d'erreur DISTINCT de « 0 résultat ». Avant, le catch
  // faisait juste setResults([]) → un échec API affichait « Aucun résultat »
  // (trompeur : laisse croire qu'il n'y a pas de correspondance plutôt qu'une
  // panne). On distingue les deux à l'affichage.
  const [errored, setErrored] = useState(false);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      setDidSearch(false);
      setErrored(false);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setResults(data.results ?? []);
          setErrored(false);
          setDidSearch(true);
          // Sync URL pour deep-link (shallow)
          const params = new URLSearchParams();
          params.set('q', q);
          window.history.replaceState(null, '', `/search?${params.toString()}`);
        } catch {
          setResults([]);
          setErrored(true);
          setDidSearch(true);
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="Tape ta question ou un mot-clé…"
        style={{
          width: '100%',
          padding: '20px 24px',
          fontSize: 18,
          border: '2px solid var(--border-default)',
          borderRadius: 'var(--r-lg)',
          background: 'var(--bg-canvas)',
          fontFamily: 'inherit',
          marginBottom: 20,
          outline: 'none',
        }}
      />

      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, minHeight: 18 }}>
        {q.length < 2
          ? 'Tape au moins 2 caractères pour chercher.'
          : loading
            ? 'Recherche…'
            : errored
              ? 'La recherche a échoué.'
              : didSearch
                ? `${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${q} »`
                : ''}
      </div>

      {errored && !loading && (
        <div
          role="alert"
          style={{
            padding: 40,
            textAlign: 'center',
            background: 'var(--danger-soft, #fef2f2)',
            border: '1px solid var(--danger, #dc2626)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--danger, #dc2626)',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
          <p style={{ fontSize: 14, margin: '0 0 12px' }}>
            La recherche n&apos;a pas pu aboutir (problème de connexion). Réessaie dans un instant.
          </p>
          <p style={{ fontSize: 12, margin: 0 }}>
            Si ça persiste, <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>écris-nous</a>.
          </p>
        </div>
      )}

      {!errored && results.length === 0 && didSearch && !loading && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
          <p style={{ fontSize: 14, margin: '0 0 12px' }}>
            Aucun résultat. Essaie un terme plus court ou différent.
          </p>
          <p style={{ fontSize: 12, margin: 0 }}>
            Tu peux aussi <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>nous écrire</a> directement.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {results.map((r, i) => {
          const info = TYPE_INFO[r.type];
          return (
            <Link
              key={i}
              href={r.href as never}
              style={{
                padding: 20,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                textDecoration: 'none',
                color: 'inherit',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 16,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ fontSize: 24 }} aria-hidden>{info.icon}</div>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--accent-primary)',
                      fontWeight: 600,
                    }}
                  >
                    {info.label}
                  </span>
                  {r.meta && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      · {r.meta}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {r.primary}
                </div>
                {r.secondary && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {r.secondary}
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
