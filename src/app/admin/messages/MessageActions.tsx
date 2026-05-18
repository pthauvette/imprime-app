'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function MessageActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/messages/${id}`, {
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

  async function addNote() {
    const note = window.prompt('Note interne admin :', '');
    if (note === null) return;
    await patch({ action: 'note', adminNotes: note.trim() });
  }

  return (
    <>
      {status === 'OPEN' && (
        <button onClick={() => patch({ action: 'answered' })} disabled={busy} className="btn btn-ghost btn-sm">
          ✓ Marquer répondu
        </button>
      )}
      {status !== 'CLOSED' && (
        <button onClick={() => patch({ action: 'close' })} disabled={busy} className="btn btn-ghost btn-sm">
          🗄 Fermer
        </button>
      )}
      <button onClick={addNote} disabled={busy} className="btn btn-ghost btn-sm">
        + Note
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
