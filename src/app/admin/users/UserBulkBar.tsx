'use client';

/**
 * Sticky bulk action bar pour /admin/users. Mirroir d'OrderBulkBar :
 * attache aux checkboxes existants via data-user-id, expose actions
 * via POST /api/admin/users/bulk + lien direct vers /api/admin/users/export
 * (qui respecte filter + q de l'URL en cours).
 *
 * Actions :
 *   - Set role USER ou ADMIN
 *   - Opt-out / opt-in email delivery notifications (CASL : utile pour
 *     auto-unsubscribe en masse si bounces ou plaintes)
 *   - Export CSV (toujours visible, pas besoin de sélection)
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type BulkAction =
  | { action: 'set-role'; userIds: string[]; role: 'USER' | 'ADMIN' }
  | { action: 'opt-out-emails'; userIds: string[] }
  | { action: 'opt-in-emails'; userIds: string[] };

export default function UserBulkBar() {
  const router = useRouter();
  const search = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function refreshSelection() {
      const checked = new Set<string>();
      document.querySelectorAll<HTMLInputElement>('input.usr-checkbox[data-user-id]:checked')
        .forEach((el) => {
          const id = el.dataset.userId;
          if (id) checked.add(id);
        });
      setSelectedIds(checked);
    }

    function onChange(e: Event) {
      const t = e.target as HTMLInputElement;
      if (!t.classList.contains('usr-checkbox')) return;
      // Select-all toggle (no data-user-id)
      if (!t.dataset.userId) {
        document.querySelectorAll<HTMLInputElement>('input.usr-checkbox[data-user-id]')
          .forEach((cb) => { cb.checked = t.checked; });
      }
      refreshSelection();
    }

    document.addEventListener('change', onChange);
    refreshSelection();
    return () => document.removeEventListener('change', onChange);
  }, []);

  function clearSelection() {
    document.querySelectorAll<HTMLInputElement>('input.usr-checkbox')
      .forEach((cb) => { cb.checked = false; });
    setSelectedIds(new Set());
  }

  async function runBulk(payload: BulkAction, confirmMsg: string) {
    if (selectedIds.size === 0) return;
    if (!window.confirm(confirmMsg)) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/users/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const msg = data.excludedSelf
          ? `${data.affected} mis à jour (toi exclu).`
          : `${data.affected} mis à jour.`;
        setResult(msg);
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function exportHref(): string {
    const params = new URLSearchParams();
    const filter = search.get('filter');
    const q = search.get('q');
    if (filter) params.set('filter', filter);
    if (q) params.set('q', q);
    return `/api/admin/users/export${params.toString() ? '?' + params.toString() : ''}`;
  }

  return (
    <div
      role="toolbar"
      aria-label="Actions bulk utilisateurs"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--text-primary)',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 'var(--r-pill)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 50,
        flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 48px)',
      }}
    >
      {selectedIds.size > 0 ? (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBulk(
              { action: 'set-role', userIds: Array.from(selectedIds), role: 'ADMIN' },
              `Promouvoir ${selectedIds.size} utilisateur(s) au rôle ADMIN ? Ils auront accès à tout l'admin.`,
            )}
            style={bulkBtnStyle}
          >
            ↑ Promouvoir ADMIN
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBulk(
              { action: 'set-role', userIds: Array.from(selectedIds), role: 'USER' },
              `Rétrograder ${selectedIds.size} utilisateur(s) au rôle USER ?`,
            )}
            style={ghostBtnStyle}
          >
            ↓ Rétrograder USER
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBulk(
              { action: 'opt-out-emails', userIds: Array.from(selectedIds) },
              `Désinscrire ${selectedIds.size} utilisateur(s) des emails de notifications ?`,
            )}
            style={ghostBtnStyle}
          >
            ✕ Opt-out emails
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={busy}
            style={{ ...ghostBtnStyle, opacity: 0.7 }}
          >
            Annuler
          </button>
        </>
      ) : (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.6 }}>
            Aucun sélectionné
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
        </>
      )}

      {/* Export CSV always available */}
      <a
        href={exportHref()}
        style={{
          padding: '6px 14px',
          background: 'var(--accent-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        ⬇ Export CSV
      </a>

      {result && (
        <span style={{ fontSize: 12, color: 'var(--success, #4ade80)' }}>✓ {result}</span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: 'var(--danger)' }}>✗ {error}</span>
      )}
    </div>
  );
}

const bulkBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--accent-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--r-pill)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'inherit',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 'var(--r-pill)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
