'use client';

/**
 * Actions inline pour une demande de samples : Ship (avec tracking) /
 * Cancel / Note admin. POST PATCH /api/admin/samples/[id].
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function SampleActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/samples/${id}`, {
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

  async function markShipped() {
    const tracking = window.prompt(
      'Numéro de tracking Postes Canada (optionnel — laisse vide si pas de tracking) :',
      '',
    );
    if (tracking === null) return; // cancel
    await patch({ action: 'ship', trackingNumber: tracking.trim() || null });
  }

  async function cancel() {
    if (!window.confirm('Annuler cette demande ? Le customer ne sera pas notifié automatiquement.')) return;
    await patch({ action: 'cancel' });
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
          <button onClick={markShipped} disabled={busy} className="btn btn-primary btn-sm">
            ✓ Marquer expédié
          </button>
          <button onClick={cancel} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
            ✗ Annuler
          </button>
        </>
      )}
      {status === 'SHIPPED' && (
        <button onClick={cancel} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
          Marquer annulé
        </button>
      )}
      <button onClick={addNote} disabled={busy} className="btn btn-ghost btn-sm">
        + Note
      </button>
      {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
