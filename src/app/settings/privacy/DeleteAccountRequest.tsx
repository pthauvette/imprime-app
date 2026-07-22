'use client';

import { useState, useTransition } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';

/**
 * Bouton de demande de suppression de compte. POST /api/account/delete-request
 * qui crée une entrée DeleteAccountRequest (status PENDING) + alerte admin.
 *
 * Pas de hard delete immédiat — admin doit valider manuellement (vérif
 * commandes en cours, identité, etc.).
 */
export default function DeleteAccountRequest() {
  const { confirm, dialog } = useConfirmDialog();
  const [busy, startTransition] = useTransition();
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    // Round 9 #2 — modal stylé (action destructive customer).
    const confirmed = await confirm({
      title: 'Demander la suppression de ton compte ?',
      body:
        'Cette demande sera traitée manuellement par l\'admin (typiquement 1-2 j ouvrables) ; ' +
        'tu recevras un email de confirmation. L\'historique des commandes facturées est conservé ' +
        '(obligation fiscale 6 ans).',
      confirmLabel: 'Demander la suppression',
      danger: true,
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/account/delete-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason.trim() || undefined }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (done) {
    return (
      <div
        role="status"
        style={{
          padding: 16,
          background: 'var(--accent-soft)',
          color: 'var(--accent-primary)',
          borderRadius: 'var(--r-md)',
          fontSize: 14,
        }}
      >
        <Icon name="check" size={14} /> Ta demande de suppression a été enregistrée. On la traite manuellement et
        on te recontacte sous 1-2 jours ouvrables à ton email d&apos;inscription.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {dialog}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Raison (optionnel — ça nous aide à améliorer le service)"
        style={{
          padding: '10px 12px',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-sm)',
          fontSize: 13,
          fontFamily: 'inherit',
          background: 'var(--bg-canvas)',
          color: 'var(--text-primary)',
          resize: 'vertical',
        }}
      />
      {error && (
        <div role="alert" style={{ padding: 10, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="btn btn-sm"
        style={{
          background: 'var(--danger)',
          color: '#fff',
          border: 'none',
          opacity: busy ? 0.6 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {busy ? 'Envoi…' : 'Demander la suppression de mon compte'}
      </button>
    </div>
  );
}
