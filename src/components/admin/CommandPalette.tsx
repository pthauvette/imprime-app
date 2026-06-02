'use client';

/**
 * Command palette admin — overlay invoké par Cmd/Ctrl+K (ou clic).
 * Tape directement dans la search box pour query /api/admin/search,
 * navigue dans les résultats au clavier (↑↓ + Enter pour ouvrir).
 *
 * Mount global dans le layout admin → dispo partout sans re-import.
 * Pas de portail React (Next/React 18 supporte déjà position:fixed pour
 * ces overlays simples — pas besoin de createPortal).
 */

import { useEffect, useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';

interface ResultItem {
  type: 'order' | 'user' | 'message' | 'quote' | 'reseller' | 'broadcast';
  id: string;
  href: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

const TYPE_ICONS: Record<ResultItem['type'], string> = {
  order: '📦',
  user: '👤',
  message: '💬',
  quote: '💰',
  reseller: '🎯',
  broadcast: '📨',
};

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Round 7 #1 — focus-trap + restore (Cmd+K ouvre ; Escape ferme déjà géré).
  useFocusTrap(dialogRef, open);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isShortcut = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (isShortcut) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Focus input quand on ouvre
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [open]);

  // Reset state quand on ferme
  useEffect(() => {
    if (!open) {
      setQ('');
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          setResults(data.results ?? []);
          setActiveIdx(0);
        } catch {
          setResults([]);
        }
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function navigate(item: ResultItem) {
    // `item.href` est une string runtime venant de l'API — Next.js typed
    // routes attend un RouteImpl à la compile. Cast vide TS-safe (la route
    // est validée serveur-side dans /api/admin/search).
    router.push(item.href as never);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIdx];
      if (item) navigate(item);
    }
  }

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Recherche globale"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: 640,
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-default)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden style={{ fontSize: 18, color: 'var(--text-muted)' }}>🔍</span>
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cherche email, nom, commande, sujet…"
            // Round 7 #4 — pattern combobox : la sélection clavier ↑↓ devient
            // audible (aria-activedescendant pointe l'option active).
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="cmdk-listbox"
            aria-autocomplete="list"
            aria-activedescendant={results.length > 0 ? `cmdk-opt-${activeIdx}` : undefined}
            aria-label="Recherche globale admin"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 16,
              color: 'var(--text-primary)',
              fontFamily: 'inherit',
            }}
          />
          <kbd
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              padding: '2px 6px',
              border: '1px solid var(--border-default)',
              borderRadius: 3,
              background: 'var(--bg-sunken)',
            }}
          >
            ESC
          </kbd>
        </div>

        <div id="cmdk-listbox" role="listbox" aria-label="Résultats de recherche" style={{ maxHeight: 400, overflowY: 'auto' }}>
          {q.length < 2 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Tape au moins 2 caractères. <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-sunken)' }}>↑↓</kbd> pour naviguer, <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-sunken)' }}>↵</kbd> pour ouvrir.
            </div>
          ) : loading && results.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Recherche…
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
              Aucun résultat pour « {q} »
            </div>
          ) : (
            results.map((r, i) => (
              <div
                key={`${r.type}:${r.id}`}
                id={`cmdk-opt-${i}`}
                role="option"
                aria-selected={i === activeIdx}
                onClick={() => navigate(r)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  padding: '10px 18px',
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto',
                  gap: 12,
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: i === activeIdx ? 'var(--accent-soft)' : 'transparent',
                  borderBottom: i < results.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <span aria-hidden style={{ fontSize: 16 }}>{TYPE_ICONS[r.type]}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.primary}
                  </div>
                  {r.secondary && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.secondary}
                    </div>
                  )}
                </div>
                {r.meta && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {r.meta}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <span>
            <kbd style={{ fontFamily: 'var(--font-mono)', padding: '1px 5px', border: '1px solid var(--border-default)', borderRadius: 3, background: 'var(--bg-sunken)' }}>⌘K</kbd>
            {' '}pour ouvrir/fermer
          </span>
          <span>{results.length > 0 && `${results.length} résultats`}</span>
        </div>
      </div>
    </div>
  );
}
