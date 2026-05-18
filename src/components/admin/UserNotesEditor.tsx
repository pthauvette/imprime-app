'use client';

/**
 * Editor inline pour `User.adminNotes` sur /admin/users/[id].
 *
 * Comportement :
 *   - Affiche les notes existantes (read-only)
 *   - Bouton "Modifier" passe en mode édition (textarea)
 *   - Save → PATCH /api/admin/users/[id]/notes → router.refresh()
 *   - Affiche qui a fait la dernière édition + quand (audit lite)
 *
 * Garde-fous :
 *   - max 5000 chars (badge counter)
 *   - Optimistic UI : disable le bouton pendant la requête
 *   - Erreur affichée inline
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  userId: string;
  initialNotes: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const MAX_CHARS = 5000;

export default function UserNotesEditor({
  userId,
  initialNotes,
  updatedAt,
  updatedBy,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function save() {
    setError(null);
    const trimmed = notes.trim();
    try {
      const res = await fetch(`/api/admin/users/${userId}/notes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: trimmed === '' ? null : trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Erreur inconnue');
        return;
      }
      setEditing(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
    }
  }

  function cancel() {
    setNotes(initialNotes ?? '');
    setError(null);
    setEditing(false);
  }

  const charCount = notes.length;
  const overLimit = charCount > MAX_CHARS;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 20,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}
        >
          📝 Notes internes
        </h3>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-ghost"
            style={{ fontSize: 12, padding: '4px 12px' }}
          >
            {initialNotes ? 'Modifier' : '+ Ajouter'}
          </button>
        )}
      </div>

      {!editing ? (
        <div>
          {initialNotes ? (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: 'var(--text-primary)',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {initialNotes}
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              Aucune note. Ajoute un memo interne pour ce customer (jamais affiché côté user).
            </p>
          )}
          {initialNotes && updatedAt && (
            <p
              style={{
                margin: '10px 0 0 0',
                fontSize: 11,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Édité par {updatedBy ?? 'admin'} le{' '}
              {new Date(updatedAt).toLocaleDateString('fr-CA', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex : Client B2B avec compte payment terms Net 30. Préfère appel le matin."
            rows={6}
            spellCheck
            autoFocus
            style={{
              padding: '10px 12px',
              border: `1px solid ${overLimit ? 'var(--danger, #dc2626)' : 'var(--border-default)'}`,
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              resize: 'vertical',
              background: 'var(--bg-canvas)',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: overLimit ? 'var(--danger, #dc2626)' : 'var(--text-muted)',
              }}
            >
              {charCount} / {MAX_CHARS}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={cancel}
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                disabled={pending}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                className="btn btn-primary"
                style={{ fontSize: 12 }}
                disabled={pending || overLimit}
              >
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
          {error && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--danger, #dc2626)',
                background: 'var(--danger-soft, #fef2f2)',
                padding: '8px 12px',
                borderRadius: 'var(--r-sm)',
              }}
            >
              ⚠ {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
