'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function ResellerActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/reseller-applications/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function reject() {
    const note = window.prompt('Raison du refus (optionnel, pour audit) :', '');
    if (note === null) return;
    await patch({ action: 'reject', adminNotes: note.trim() || undefined });
  }

  async function addNote() {
    const note = window.prompt('Note admin (visible uniquement en interne) :', '');
    if (note === null) return;
    await patch({ action: 'note', adminNotes: note.trim() });
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {status === 'PENDING' && (
        <>
          <button onClick={() => patch({ action: 'approve' })} disabled={busy} className="btn btn-primary btn-sm">
            ✓ Approuver
          </button>
          <button onClick={reject} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
            ✗ Refuser
          </button>
        </>
      )}
      {status === 'REJECTED' && (
        <button onClick={() => patch({ action: 'approve' })} disabled={busy} className="btn btn-primary btn-sm">
          Réhabiliter
        </button>
      )}
      {(status === 'APPROVED' || status === 'REJECTED') && (
        <button onClick={() => patch({ action: 'archive' })} disabled={busy} className="btn btn-ghost btn-sm">
          Archiver
        </button>
      )}
      <button onClick={addNote} disabled={busy} className="btn btn-ghost btn-sm">
        + Note
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
