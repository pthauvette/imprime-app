'use client';

/**
 * MessageActions — actions inline pour un ContactMessage row.
 *
 * Round 18 #4 — ajout du bouton "Répondre" qui ouvre un drawer inline
 * (pas de modal full-screen — l'admin voit la liste + le drawer en même
 * temps pour copy-paste cross-row).
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Props {
  id: string;
  status: string;
  email: string;
  subject: string;
}

export default function MessageActions({ id, status, email, subject }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySubject, setReplySubject] = useState(`Re: ${subject}`);

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

  async function sendReply() {
    if (replyBody.trim().length < 10) {
      setError('Réponse trop courte (min 10 caractères)');
      return;
    }
    await patch({
      action: 'reply',
      body: replyBody.trim(),
      subjectOverride: replySubject.trim() !== `Re: ${subject}` ? replySubject.trim() : undefined,
    });
    setReplying(false);
    setReplyBody('');
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {status !== 'CLOSED' && (
          <button onClick={() => setReplying(!replying)} disabled={busy} className="btn btn-primary btn-sm">
            {replying ? 'Annuler' : '✉ Répondre'}
          </button>
        )}
        {status === 'OPEN' && !replying && (
          <button onClick={() => patch({ action: 'answered' })} disabled={busy} className="btn btn-ghost btn-sm">
            ✓ Marquer répondu (sans email)
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
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </div>

      {/* Reply drawer inline */}
      {replying && (
        <div style={{
          marginTop: 12,
          padding: 16,
          background: 'var(--bg-canvas)',
          border: '1px solid var(--accent-primary)',
          borderRadius: 'var(--r-md)',
          display: 'grid',
          gap: 10,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Réponse à <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> · va via la queue email (retry auto si SES throttle)
          </div>
          <input
            type="text"
            value={replySubject}
            onChange={(e) => setReplySubject(e.target.value)}
            placeholder="Subject"
            maxLength={200}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
            disabled={busy}
          />
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Réponse au client..."
            rows={6}
            maxLength={5000}
            autoFocus
            style={{
              padding: '10px 12px',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              fontSize: 13,
              font: 'inherit',
              resize: 'vertical',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
            disabled={busy}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {replyBody.length} / 5000 chars · marquera ANSWERED après envoi
            </span>
            <button
              type="button"
              onClick={sendReply}
              disabled={busy || replyBody.trim().length < 10}
              className="btn btn-primary btn-sm"
            >
              {busy ? 'Envoi…' : 'Envoyer →'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
