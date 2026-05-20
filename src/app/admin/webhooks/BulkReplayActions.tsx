'use client';

/**
 * BulkReplayActions — client component pour bulk-select webhook events
 * + bouton "Replay sélection". Round 20 #2.
 *
 * Strategy : on mount, attach un click listener sur les checkboxes de la
 * table (rendered server-side). State local = Set<id>. Quand au moins 1
 * checked → render le sticky action bar.
 */

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  eventIds: string[];
}

export default function BulkReplayActions({ eventIds }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  // Attach checkbox click handlers
  useEffect(() => {
    const handlers: Array<{ el: HTMLInputElement; fn: () => void }> = [];
    for (const id of eventIds) {
      const el = document.querySelector<HTMLInputElement>(`input[data-webhook-id="${id}"]`);
      if (!el) continue;
      const fn = () => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (el.checked) next.add(id);
          else next.delete(id);
          return next;
        });
      };
      el.addEventListener('change', fn);
      handlers.push({ el, fn });
    }
    return () => handlers.forEach(({ el, fn }) => el.removeEventListener('change', fn));
  }, [eventIds]);

  // Select-all checkbox (header)
  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>('input[data-webhook-select-all]');
    if (!el) return;
    const fn = () => {
      const all = el.checked;
      // Toggle all row checkboxes
      for (const id of eventIds) {
        const row = document.querySelector<HTMLInputElement>(`input[data-webhook-id="${id}"]`);
        if (row) row.checked = all;
      }
      setSelected(all ? new Set(eventIds) : new Set());
    };
    el.addEventListener('change', fn);
    return () => el.removeEventListener('change', fn);
  }, [eventIds]);

  async function handleReplay() {
    if (selected.size === 0 || busy) return;
    if (selected.size > 50) {
      setError('Max 50 events par batch — désélectionne ou fais 2 batches.');
      return;
    }
    if (!window.confirm(`Replay ${selected.size} webhook event${selected.size > 1 ? 's' : ''} ? Cette action ré-exécute la business logic (orders update, emails) — irréversible.`)) {
      return;
    }

    setError(null);
    setDoneMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/webhooks/bulk-replay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: Array.from(selected) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setDoneMsg(`✓ ${data.totalSucceeded} / ${data.totalProcessed} replayed avec succès. Refresh pour voir les outcomes.`);
        setSelected(new Set());
        // Reset checkboxes visually
        for (const id of eventIds) {
          const row = document.querySelector<HTMLInputElement>(`input[data-webhook-id="${id}"]`);
          if (row) row.checked = false;
        }
        const all = document.querySelector<HTMLInputElement>('input[data-webhook-select-all]');
        if (all) all.checked = false;
        setTimeout(() => router.refresh(), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (selected.size === 0 && !doneMsg && !error) return null;

  return (
    <div style={{
      position: 'sticky',
      bottom: 16,
      zIndex: 10,
      padding: '12px 16px',
      background: 'var(--bg-surface)',
      border: '2px solid var(--accent-primary)',
      borderRadius: 'var(--r-md)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      marginTop: 16,
      flexWrap: 'wrap',
    }}>
      {error && (
        <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 600 }} role="alert">
          {error}
        </span>
      )}
      {doneMsg && (
        <span style={{ color: 'var(--success, #16a34a)', fontSize: 13, fontWeight: 600 }} role="status">
          {doneMsg}
        </span>
      )}
      {selected.size > 0 && !doneMsg && !error && (
        <>
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {selected.size} event{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                for (const id of eventIds) {
                  const row = document.querySelector<HTMLInputElement>(`input[data-webhook-id="${id}"]`);
                  if (row) row.checked = false;
                }
                const all = document.querySelector<HTMLInputElement>('input[data-webhook-select-all]');
                if (all) all.checked = false;
              }}
              className="btn btn-ghost btn-sm"
              disabled={busy}
            >
              Annuler sélection
            </button>
            <button
              type="button"
              onClick={handleReplay}
              disabled={busy}
              className="btn btn-primary btn-sm"
            >
              {busy ? '↻ Replay en cours…' : `↻ Replay ${selected.size} event${selected.size > 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
