'use client';

/**
 * PipedaDeleteButton — bouton + modal pour approuver la suppression
 * PIPEDA d'un user. Visible uniquement si une DeleteAccountRequest
 * PENDING/APPROVED existe (passed via prop par le parent server).
 *
 * UX double-tap : modal demande de taper "SUPPRIMER" pour confirmer.
 * Aucune action n'est possible accidentellement.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';
import { Icon } from '@/components/ui/Icon';

interface Props {
  userId: string;
  userEmail: string;
  requestId: string;
  requestCreatedAt: string;
  requestReason?: string | null;
}

export default function PipedaDeleteButton({
  userId, userEmail, requestId, requestCreatedAt, requestReason,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  // A11y (#9.x) : focus piégé + restauré, Escape ferme — mais PAS pendant la
  // suppression en cours (cohérent avec le backdrop qui ignore le click si busy).
  const dialogRef = useModalFocusTrap<HTMLDivElement>(open, () => {
    if (!busy) setOpen(false);
  });

  const canSubmit = confirmText === 'SUPPRIMER' && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/delete-pipeda`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirm: 'SUPPRIMER',
            adminNotes: adminNotes.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setOpen(false);
        // Refresh la page admin pour voir le user anonymisé
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <>
      <div style={{
        padding: '14px 16px',
        background: 'var(--danger-soft, #fef2f2)',
        border: '1px solid var(--danger, #dc2626)',
        borderRadius: 'var(--r-md)',
        marginBottom: 12,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--danger, #dc2626)',
          fontWeight: 700,
          marginBottom: 8,
        }}>
          <Icon name="alert" size={14} /> Demande PIPEDA en cours
        </div>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--text-primary)' }}>
          Soumise le {new Date(requestCreatedAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}.
        </p>
        {requestReason && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Raison du client : « {requestReason.slice(0, 200)}{requestReason.length > 200 ? '…' : ''} »
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            marginTop: 10,
            padding: '8px 14px',
            background: 'var(--danger, #dc2626)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          Approuver la suppression →
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pipeda-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false);
          }}
        >
          <div ref={dialogRef} style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--r-xl, 16px)',
            padding: 28,
            maxWidth: 520,
            width: '100%',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            border: '1px solid var(--border-subtle)',
          }}>
            <h2 id="pipeda-modal-title" style={{
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              margin: '0 0 12px',
              color: 'var(--danger, #dc2626)',
              fontWeight: 400,
              letterSpacing: '-0.02em',
            }}>
              <Icon name="alert" size={14} /> Suppression PIPEDA — irréversible
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px' }}>
              Tu vas <strong>anonymiser</strong> le compte de <code>{userEmail}</code>.
              Cette action :
            </p>
            <ul style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 18, paddingLeft: 20 }}>
              <li>Nullifie email, nom, téléphone, adresses, code referral</li>
              <li>Delete toutes ses sessions, brouillons, designs sauvés</li>
              <li><strong>Conserve les commandes</strong> (LIR art. 230 — 6 ans)</li>
              <li>Envoie un email de confirmation à <code>{userEmail}</code></li>
              <li>Marque la demande PIPEDA #{requestId.slice(-6).toUpperCase()} comme PROCESSED</li>
            </ul>

            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: 6,
              }}>
                Notes admin (optionnel)
              </span>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Ex : checked orders done, no active reseller status, referral credit was 0"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 13,
                  font: 'inherit',
                  resize: 'vertical',
                  background: 'var(--bg-canvas)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 18 }}>
              <span style={{
                display: 'block',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--danger, #dc2626)',
                fontWeight: 700,
                marginBottom: 6,
              }}>
                Tape « SUPPRIMER » pour confirmer
              </span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                placeholder="SUPPRIMER"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: `2px solid ${confirmText === 'SUPPRIMER' ? 'var(--danger, #dc2626)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--r-sm)',
                  fontSize: 16,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.06em',
                  background: 'var(--bg-canvas)',
                  color: 'var(--text-primary)',
                }}
              />
            </label>

            {error && (
              <div role="alert" style={{
                padding: 12,
                background: 'var(--danger-soft, #fef2f2)',
                color: 'var(--danger, #dc2626)',
                borderRadius: 'var(--r-sm)',
                fontSize: 13,
                marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="btn btn-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                  padding: '10px 18px',
                  background: canSubmit ? 'var(--danger, #dc2626)' : 'var(--text-muted)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--r-sm)',
                  fontWeight: 600,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                }}
              >
                {busy ? 'Suppression…' : 'Confirmer la suppression PIPEDA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
