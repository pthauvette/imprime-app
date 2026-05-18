'use client';

/**
 * Actions admin sur une demande de devis sur-mesure.
 * Pattern useTransition pour l'optimistic UX (busy state pendant le PATCH).
 *
 * Le "quote" action ouvre un prompt simple pour le brouillon de réponse.
 * Pour MVP, l'admin copy-paste ça dans son email manuel — quand on aura
 * un editor markdown, on pourra rendre ce flow plus poli.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function QuoteActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/quotes/${id}`, {
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

  async function markQuoted() {
    const response = window.prompt(
      'Brouillon de quote envoyé (pour archiver le contenu, mailto se fait à part) :',
      '',
    );
    if (response === null) return;
    if (response.trim().length === 0) return;
    await patch({ action: 'quoted', adminResponse: response.trim() });
  }

  async function reject() {
    const note = window.prompt('Raison du refus (optionnel) :', '');
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
          <button onClick={markQuoted} disabled={busy} className="btn btn-primary btn-sm">
            📝 Marquer quoté
          </button>
          <button onClick={reject} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
            ✗ Refuser
          </button>
        </>
      )}
      {status === 'QUOTED' && (
        <>
          <button onClick={() => patch({ action: 'accept' })} disabled={busy} className="btn btn-primary btn-sm">
            ✓ Client a accepté
          </button>
          <button onClick={reject} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
            ✗ Client a refusé
          </button>
        </>
      )}
      {(status === 'ACCEPTED' || status === 'REJECTED' || status === 'QUOTED') && (
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
