'use client';

/**
 * Actions admin sur une application reseller : Approve / Reject / Note / Archive.
 *
 * Round 41 #2 — Inline forms (openForm metadata) à la place des 2 window.prompt.
 * 'reject' : raison optionnelle (string vide = pas de note). 'note' : raison
 * obligatoire (note interne).
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type FormMode = null | 'reject' | 'note';

export default function ResellerActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<FormMode>(null);
  const [formText, setFormText] = useState('');

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

  function openInlineForm(mode: FormMode) {
    setOpenForm(mode);
    setFormText('');
    setError(null);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = formText.trim();
    if (openForm === 'reject') {
      // Raison optionnelle pour reject — string vide = pas de note attachée
      setOpenForm(null);
      await patch({ action: 'reject', adminNotes: trimmed || undefined });
    } else if (openForm === 'note') {
      if (!trimmed) {
        setError('Note requise');
        return;
      }
      setOpenForm(null);
      await patch({ action: 'note', adminNotes: trimmed });
    }
  }

  const formMeta = openForm === 'reject'
    ? {
        label: 'Raison du refus (optionnel, pour audit)',
        sublabel: 'Visible interne uniquement — peut être laissé vide',
        rows: 3,
        placeholder: 'Ex : Volume insuffisant pour qualifier (< 5 orders/an)',
        submitLabel: 'Refuser',
        submitColor: 'var(--danger)',
      }
    : openForm === 'note'
      ? {
          label: 'Note admin (visible uniquement en interne)',
          sublabel: 'Pour tracker un follow-up, un appel, etc.',
          rows: 3,
          placeholder: 'Ex : Demande de précisions envoyée le 25',
          submitLabel: 'Ajouter la note',
          submitColor: 'var(--accent-primary)',
        }
      : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'PENDING' && (
          <>
            <button onClick={() => patch({ action: 'approve' })} disabled={busy} className="btn btn-primary btn-sm">
              ✓ Approuver
            </button>
            <button onClick={() => openInlineForm('reject')} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
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
        <button onClick={() => openInlineForm('note')} disabled={busy} className="btn btn-ghost btn-sm">
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
          <label htmlFor={`reseller-form-${id}-${openForm}`} style={{ fontSize: 12, fontWeight: 600 }}>
            {formMeta.label}
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
              {formMeta.sublabel}
            </span>
          </label>
          <textarea
            id={`reseller-form-${id}-${openForm}`}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            placeholder={formMeta.placeholder}
            rows={formMeta.rows}
            maxLength={2000}
            autoFocus
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', resize: 'vertical', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            disabled={busy}
          />
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
