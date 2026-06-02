'use client';

/**
 * SavedFiltersBar — dropdown "Mes filtres" + bouton "Sauvegarder" pour
 * bookmarker la query string actuelle.
 *
 * Round 26 #5. Per-admin (la route API filtre par session.user.id).
 *
 * Props :
 *   - scope : "orders" | "users" | "webhooks" | ... (clé d'isolation)
 *   - basePath : "/admin/orders" — utilisé pour construire les liens
 *   - initialFilters : pré-load fetched server-side pour first paint
 *     instantané (vs spinner). Le component refetch après mutations
 *     pour rester sync sans router.refresh().
 */

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface SavedFilter {
  id: string;
  name: string;
  queryString: string;
  createdAt: string | Date;
}

interface Props {
  scope: string;
  basePath: string;
  initialFilters?: SavedFilter[];
}

export default function SavedFiltersBar({ scope, basePath, initialFilters = [] }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<SavedFilter[]>(initialFilters);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQs = searchParams.toString();
  const hasQs = currentQs.length > 0;

  async function refetch() {
    try {
      const res = await fetch(`/api/admin/saved-filters?scope=${scope}`);
      if (res.ok) {
        const data = await res.json() as { filters: SavedFilter[] };
        setFilters(data.filters);
      }
    } catch {
      // Silent — pas critique si refetch fail, le user peut F5
    }
  }

  async function save() {
    if (!savingName?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/saved-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, name: savingName.trim(), queryString: currentQs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setSavingName(null);
      await refetch();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ title: 'Supprimer ce filtre ?', confirmLabel: 'Supprimer', danger: true }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/saved-filters/${id}`, { method: 'DELETE' });
      if (res.ok) await refetch();
    } finally {
      setBusy(false);
    }
  }

  // Sync filters quand le pathname/scope change (rare, mais safer)
  useEffect(() => {
    if (initialFilters.length === 0) void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
      {dialog}
      {filters.length > 0 && (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Mes filtres
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {filters.map((f) => (
              <span
                key={f.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 4px 2px 10px',
                  background: 'var(--bg-sunken)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-pill)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <a
                  href={`${basePath}?${f.queryString}`}
                  style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                  title={f.queryString}
                >
                  {f.name}
                </a>
                <button
                  type="button"
                  onClick={() => void remove(f.id)}
                  disabled={busy}
                  aria-label={`Supprimer ${f.name}`}
                  title="Supprimer"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0 4px',
                    fontSize: 12,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </>
      )}

      {hasQs && savingName === null && (
        <button
          type="button"
          onClick={() => setSavingName('')}
          disabled={busy}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--r-pill)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
          title="Sauvegarder la combinaison actuelle de filtres"
        >
          💾 Sauvegarder ces filtres
        </button>
      )}

      {savingName !== null && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="text"
            autoFocus
            value={savingName}
            onChange={(e) => setSavingName(e.target.value.slice(0, 60))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') setSavingName(null);
            }}
            placeholder="Nom (ex: Refunds urgents)"
            maxLength={60}
            style={{
              padding: '4px 8px',
              fontSize: 12,
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              fontFamily: 'inherit',
              minWidth: 180,
            }}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !savingName.trim()}
            style={{
              padding: '4px 10px',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-sm)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setSavingName(null)}
            disabled={busy}
            style={{
              padding: '4px 8px',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
        </div>
      )}

      {error && (
        <span style={{ color: 'var(--danger)', fontSize: 11 }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
