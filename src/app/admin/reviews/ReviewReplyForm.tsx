'use client';

/**
 * ReviewReplyForm — Client Component, inline dans la card review admin.
 *
 * Round 25 #4. Style Trustpilot : un textarea + bouton "Poster" qui appelle
 * PATCH /api/admin/reviews/[id] avec action=reply. Persiste le draft tant
 * que le user typing (state local). router.refresh() après succès pour
 * re-render la card avec la nouvelle réponse.
 *
 * Si une réponse existe déjà, on affiche dans un encart différencié + le
 * textarea est pré-rempli en mode édition. Bouton "Supprimer la réponse"
 * = post string vide (l'API la traduit en clear).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';

const MAX_LEN = 1500;

export default function ReviewReplyForm({
  reviewId,
  existingReply,
  existingReplyAt,
}: {
  reviewId: string;
  existingReply: string | null;
  existingReplyAt: string | null;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [draft, setDraft] = useState(existingReply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reply', adminReply: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const trimmed = draft.trim();
  const hasReply = existingReply !== null;
  const isUnchanged = trimmed === (existingReply ?? '');

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: hasReply ? 'var(--accent-soft, #f0fdf4)' : 'var(--bg-sunken)',
        border: `1px solid ${hasReply ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-sm)',
      }}
    >
      {dialog}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: hasReply ? 'var(--accent-primary)' : 'var(--text-muted)',
          fontWeight: 700,
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>
          {hasReply ? <><Icon name="check" size={14} /> Réponse Plio publiée</> : 'Réponse publique (optionnel)'}
          {existingReplyAt && (
            <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontWeight: 500 }}>
              {new Date(existingReplyAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </span>
        <span style={{ color: trimmed.length > MAX_LEN ? 'var(--danger)' : 'var(--text-muted)' }}>
          {trimmed.length} / {MAX_LEN}
        </span>
      </div>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN + 50))}
        disabled={busy}
        placeholder="Merci pour ton avis ! On..."
        rows={3}
        style={{
          width: '100%',
          padding: 8,
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: 'inherit',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-sm)',
          resize: 'vertical',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => void submit(trimmed)}
          disabled={busy || isUnchanged || trimmed.length === 0 || trimmed.length > MAX_LEN}
          style={{
            padding: '6px 14px',
            background: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            fontWeight: 600,
            cursor: busy || isUnchanged ? 'not-allowed' : 'pointer',
            opacity: busy || isUnchanged ? 0.6 : 1,
          }}
        >
          {hasReply ? 'Mettre à jour' : 'Poster la réponse'}
        </button>

        {hasReply && (
          <button
            type="button"
            onClick={async () => {
              if (await confirm({ title: 'Supprimer la réponse publique ?', body: 'Elle sera retirée immédiatement de la landing.', confirmLabel: 'Supprimer', danger: true })) {
                setDraft('');
                void submit('');
              }
            }}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--r-sm)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Supprimer
          </button>
        )}

        {error && (
          <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
