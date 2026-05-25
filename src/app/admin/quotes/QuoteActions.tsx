'use client';

/**
 * Actions admin sur une demande de devis sur-mesure.
 * Pattern useTransition pour l'optimistic UX (busy state pendant le PATCH).
 *
 * Round 40 #5 — Remplacement des 3 window.prompt par des inline forms
 * (mobile-unusable : prompt iOS truncated text ~25 chars visible, no
 * multiline, no styled keyboard). Pattern aligné avec OrderActions refund.
 *
 * Trois modes inline : 'quoted' (multiline quote draft), 'reject' (raison
 * courte), 'note' (note interne). État unique `openForm` pour ne pas avoir
 * 3 forms ouverts en parallèle.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type FormMode = null | 'quoted' | 'reject' | 'note';

export default function QuoteActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Round 40 #5 — One state, one form visible at a time.
  const [openForm, setOpenForm] = useState<FormMode>(null);
  const [formText, setFormText] = useState('');

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

  function openInlineForm(mode: FormMode) {
    setOpenForm(mode);
    setFormText('');
    setError(null);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = formText.trim();

    if (openForm === 'quoted') {
      if (!trimmed) {
        setError('Brouillon requis');
        return;
      }
      setOpenForm(null);
      await patch({ action: 'quoted', adminResponse: trimmed });
    } else if (openForm === 'reject') {
      // Raison du refus optionnelle (string vide = pas de note)
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

  // Pour différencier les 3 modes UX-wise
  const formMeta = {
    quoted: {
      label: 'Brouillon de quote envoyé (pour archiver le contenu, mailto se fait à part) :',
      rows: 5,
      placeholder: 'Bonjour,\n\nMerci pour ta demande. Voici notre proposition…',
      submitLabel: 'Marquer quoté',
      submitColor: 'var(--accent-primary)',
      required: true,
    },
    reject: {
      label: 'Raison du refus (optionnel) :',
      rows: 2,
      placeholder: 'Quantité trop petite pour notre process — recommandé…',
      submitLabel: 'Confirmer le refus',
      submitColor: 'var(--danger)',
      required: false,
    },
    note: {
      label: 'Note admin (visible uniquement en interne) :',
      rows: 3,
      placeholder: 'Client appelé le 14 — rappelle vendredi PM',
      submitLabel: 'Ajouter la note',
      submitColor: 'var(--accent-primary)',
      required: true,
    },
  } as const;

  const meta = openForm ? formMeta[openForm] : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'PENDING' && (
          <>
            <button onClick={() => openInlineForm('quoted')} disabled={busy} className="btn btn-primary btn-sm">
              📝 Marquer quoté
            </button>
            <button onClick={() => openInlineForm('reject')} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
              ✗ Refuser
            </button>
          </>
        )}
        {status === 'QUOTED' && (
          <>
            <button onClick={() => patch({ action: 'accept' })} disabled={busy} className="btn btn-primary btn-sm">
              ✓ Client a accepté
            </button>
            <button onClick={() => openInlineForm('reject')} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
              ✗ Client a refusé
            </button>
          </>
        )}
        {(status === 'ACCEPTED' || status === 'REJECTED' || status === 'QUOTED') && (
          <button onClick={() => patch({ action: 'archive' })} disabled={busy} className="btn btn-ghost btn-sm">
            Archiver
          </button>
        )}
        <button onClick={() => openInlineForm('note')} disabled={busy} className="btn btn-ghost btn-sm">
          + Note
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
      </div>

      {/* Round 40 #5 — Inline form (replaces window.prompt × 3) */}
      {openForm && meta && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <label htmlFor={`quote-form-${openForm}`} style={{ fontSize: 11, fontWeight: 600 }}>
            {meta.label}
          </label>
          <textarea
            id={`quote-form-${openForm}`}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            placeholder={meta.placeholder}
            rows={meta.rows}
            required={meta.required}
            maxLength={5000}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              resize: 'vertical',
            }}
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
              style={{ padding: '6px 12px', background: meta.submitColor, color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {busy ? '⏳ …' : meta.submitLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
