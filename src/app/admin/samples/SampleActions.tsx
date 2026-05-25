'use client';

/**
 * Actions inline pour une demande de samples : Ship (avec tracking) /
 * Cancel / Note admin. POST PATCH /api/admin/samples/[id].
 *
 * Round 41 #2 — Inline forms (pattern openForm avec metadata) à la place
 * des 2 window.prompt (tracking + note). iOS prompt tronqué + no styled
 * keyboard.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type FormMode = null | 'ship' | 'note';

export default function SampleActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<FormMode>(null);
  const [formText, setFormText] = useState('');

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

  function openShipForm() {
    setOpenForm('ship');
    setFormText('');
    setError(null);
  }

  function openNoteForm() {
    setOpenForm('note');
    setFormText('');
    setError(null);
  }

  async function cancel() {
    if (!window.confirm('Annuler cette demande ? Le customer ne sera pas notifié automatiquement.')) return;
    await patch({ action: 'cancel' });
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = formText.trim();
    if (openForm === 'ship') {
      // Tracking est optionnel (vide = ship sans tracking).
      setOpenForm(null);
      await patch({ action: 'ship', trackingNumber: trimmed || null });
    } else if (openForm === 'note') {
      if (!trimmed) {
        setError('Note requise');
        return;
      }
      setOpenForm(null);
      await patch({ action: 'note', adminNotes: trimmed });
    }
  }

  const formMeta = openForm === 'ship'
    ? {
        label: 'Numéro de tracking Postes Canada',
        sublabel: 'Optionnel — laisse vide si pas de tracking',
        rows: 1,
        type: 'text' as const,
        placeholder: 'Ex : 1Z999AA10123456784',
        submitLabel: 'Marquer expédié',
        submitColor: 'var(--accent-primary)',
      }
    : openForm === 'note'
      ? {
          label: 'Note admin (visible uniquement en interne)',
          sublabel: 'Visible nulle part côté client',
          rows: 3,
          type: 'textarea' as const,
          placeholder: 'Ex : Client appelé le 25 — rappelle vendredi',
          submitLabel: 'Ajouter la note',
          submitColor: 'var(--accent-primary)',
        }
      : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'PENDING' && (
          <>
            <button onClick={openShipForm} disabled={busy} className="btn btn-primary btn-sm">
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
        <button onClick={openNoteForm} disabled={busy} className="btn btn-ghost btn-sm">
          + Note
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </div>

      {openForm && formMeta && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <label htmlFor={`sample-form-${id}-${openForm}`} style={{ fontSize: 12, fontWeight: 600 }}>
            {formMeta.label}
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
              {formMeta.sublabel}
            </span>
          </label>
          {formMeta.type === 'textarea' ? (
            <textarea
              id={`sample-form-${id}-${openForm}`}
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder={formMeta.placeholder}
              rows={formMeta.rows}
              maxLength={2000}
              autoFocus
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', resize: 'vertical', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              disabled={busy}
            />
          ) : (
            <input
              id={`sample-form-${id}-${openForm}`}
              type="text"
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder={formMeta.placeholder}
              maxLength={100}
              autoFocus
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              disabled={busy}
            />
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setOpenForm(null)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{ padding: '6px 12px', background: formMeta.submitColor, color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {busy ? '⏳ …' : formMeta.submitLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
