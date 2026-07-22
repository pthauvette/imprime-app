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
import { Icon } from '@/components/ui/Icon';

interface Props {
  id: string;
  status: string;
  email: string;
  subject: string;
}

export default function MessageActions({ id, status, email, subject }: Props) {
  const router = useRouter();
  // Audit admin 2026-07 §4.3 — busy manuel : avec useTransition seul, le fetch
  // vivait DANS la transition (non awaité par l'appelant) → sendReply fermait le
  // drawer et vidait le texte AVANT de connaître le résultat (réponse perdue sur
  // échec). Le fetch est maintenant awaité et retourne un booléen ; la transition
  // ne couvre plus que router.refresh().
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replySubject, setReplySubject] = useState(`Re: ${subject}`);
  // Round 41 #1 — Inline note form (était window.prompt mobile-unusable).
  // Pattern aligné avec QuoteActions 'note' mode + le reply drawer ci-dessous.
  const [notingOpen, setNotingOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    setError(null);
    setBusy(true);
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
      startTransition(() => router.refresh());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Round 41 #1 — Inline form au lieu de window.prompt (mobile : prompt iOS
  // tronque le message ~25 chars, no multiline). Open/cancel + submit.
  function openNoteForm() {
    setNoteText('');
    setError(null);
    setNotingOpen(true);
  }

  async function submitNote() {
    const trimmed = noteText.trim();
    if (!trimmed) {
      setError('Note requise');
      return;
    }
    // §4.3 — ne fermer/vider qu'au SUCCÈS (sinon la note est perdue sur échec).
    const ok = await patch({ action: 'note', adminNotes: trimmed });
    if (ok) {
      setNotingOpen(false);
      setNoteText('');
    }
  }

  async function sendReply() {
    if (replyBody.trim().length < 10) {
      setError('Réponse trop courte (min 10 caractères)');
      return;
    }
    // §4.3 — ne fermer/vider qu'au SUCCÈS : sur échec, le drawer reste ouvert
    // avec le texte intact (avant : réponse de 4 paragraphes perdue sur un 500).
    const ok = await patch({
      action: 'reply',
      body: replyBody.trim(),
      subjectOverride: replySubject.trim() !== `Re: ${subject}` ? replySubject.trim() : undefined,
    });
    if (ok) {
      setReplying(false);
      setReplyBody('');
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {status !== 'CLOSED' && (
          <button onClick={() => setReplying(!replying)} disabled={busy} className="btn btn-primary btn-sm">
            {replying ? 'Annuler' : <><Icon name="mail" size={14} /> Répondre</>}
          </button>
        )}
        {status === 'OPEN' && !replying && (
          <button onClick={() => patch({ action: 'answered' })} disabled={busy} className="btn btn-ghost btn-sm">
            <Icon name="check" size={14} /> Marquer répondu (sans email)
          </button>
        )}
        {status !== 'CLOSED' && (
          <button onClick={() => patch({ action: 'close' })} disabled={busy} className="btn btn-ghost btn-sm">
            <Icon name="archive" size={14} /> Fermer
          </button>
        )}
        <button onClick={openNoteForm} disabled={busy} className="btn btn-ghost btn-sm">
          {notingOpen ? 'Annuler note' : '+ Note'}
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </div>

      {/* Round 41 #1 — Note drawer inline (mirrors reply drawer style below) */}
      {notingOpen && (
        <div style={{
          marginTop: 12,
          padding: 16,
          background: 'var(--bg-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-md)',
          display: 'grid',
          gap: 10,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Note interne · visible uniquement en admin · pas envoyée au client
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Ex: Client rappelé le 25 — recontacter vendredi PM"
            rows={3}
            maxLength={2000}
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
              {noteText.length} / 2000 chars
            </span>
            <button
              type="button"
              onClick={submitNote}
              disabled={busy || noteText.trim().length === 0}
              className="btn btn-primary btn-sm"
            >
              {busy ? 'Sauvegarde…' : 'Enregistrer →'}
            </button>
          </div>
        </div>
      )}

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
