'use client';

/**
 * Sticky bulk action bar pour /admin/users. Mirroir d'OrderBulkBar :
 * attache aux checkboxes existants via data-user-id, expose actions
 * via POST /api/admin/users/bulk + lien direct vers /api/admin/users/export
 * (qui respecte filter + q de l'URL en cours).
 *
 * Actions :
 *   - Set role USER ou ADMIN
 *   - Opt-out / opt-in email delivery notifications (CASL : utile pour
 *     auto-unsubscribe en masse si bounces ou plaintes)
 *   - Export CSV (toujours visible, pas besoin de sélection)
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useRouter, useSearchParams } from 'next/navigation';

type BulkAction =
  | { action: 'set-role'; userIds: string[]; role: 'USER' | 'ADMIN' }
  | { action: 'opt-out-emails'; userIds: string[] }
  | { action: 'opt-in-emails'; userIds: string[] }
  | { action: 'send-email'; userIds: string[]; subject: string; body: string };

export default function UserBulkBar() {
  const router = useRouter();
  const search = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Round 27 #2 — email composer modal
  const [emailModal, setEmailModal] = useState<{ subject: string; body: string } | null>(null);

  useEffect(() => {
    function refreshSelection() {
      const checked = new Set<string>();
      document.querySelectorAll<HTMLInputElement>('input.usr-checkbox[data-user-id]:checked')
        .forEach((el) => {
          const id = el.dataset.userId;
          if (id) checked.add(id);
        });
      setSelectedIds(checked);
    }

    function onChange(e: Event) {
      const t = e.target as HTMLInputElement;
      if (!t.classList.contains('usr-checkbox')) return;
      // Select-all toggle (no data-user-id)
      if (!t.dataset.userId) {
        document.querySelectorAll<HTMLInputElement>('input.usr-checkbox[data-user-id]')
          .forEach((cb) => { cb.checked = t.checked; });
      }
      refreshSelection();
    }

    document.addEventListener('change', onChange);
    refreshSelection();
    return () => document.removeEventListener('change', onChange);
  }, []);

  function clearSelection() {
    document.querySelectorAll<HTMLInputElement>('input.usr-checkbox')
      .forEach((cb) => { cb.checked = false; });
    setSelectedIds(new Set());
  }

  async function runBulk(payload: BulkAction, confirmMsg: string) {
    if (selectedIds.size === 0) return;
    if (!window.confirm(confirmMsg)) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/users/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        const msg = data.excludedSelf
          ? `${data.affected} mis à jour (toi exclu).`
          : `${data.affected} mis à jour.`;
        setResult(msg);
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function exportHref(): string {
    const params = new URLSearchParams();
    const filter = search.get('filter');
    const q = search.get('q');
    if (filter) params.set('filter', filter);
    if (q) params.set('q', q);
    return `/api/admin/users/export${params.toString() ? '?' + params.toString() : ''}`;
  }

  return (
    <div
      role="toolbar"
      aria-label="Actions bulk utilisateurs"
      style={{
        position: 'fixed',
        // Round 40 #4 — iOS Safari bottom URL bar overlaps fixed:bottom elements.
        // env(safe-area-inset-bottom) = 0 on non-notched devices, 34px on iPhone X+.
        bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--text-primary)',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 'var(--r-pill)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 50,
        flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 48px)',
      }}
    >
      {selectedIds.size > 0 ? (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBulk(
              { action: 'set-role', userIds: Array.from(selectedIds), role: 'ADMIN' },
              `Promouvoir ${selectedIds.size} utilisateur(s) au rôle ADMIN ? Ils auront accès à tout l'admin.`,
            )}
            style={bulkBtnStyle}
          >
            ↑ Promouvoir ADMIN
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBulk(
              { action: 'set-role', userIds: Array.from(selectedIds), role: 'USER' },
              `Rétrograder ${selectedIds.size} utilisateur(s) au rôle USER ?`,
            )}
            style={ghostBtnStyle}
          >
            ↓ Rétrograder USER
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => runBulk(
              { action: 'opt-out-emails', userIds: Array.from(selectedIds) },
              `Désinscrire ${selectedIds.size} utilisateur(s) des emails de notifications ?`,
            )}
            style={ghostBtnStyle}
          >
            ✕ Opt-out emails
          </button>
          {/* Round 27 #2 — open email composer modal */}
          <button
            type="button"
            disabled={busy || selectedIds.size > 50}
            onClick={() => setEmailModal({ subject: '', body: '' })}
            style={ghostBtnStyle}
            title={selectedIds.size > 50 ? 'Max 50 destinataires par envoi' : 'Envoyer un email personnalisé aux utilisateurs sélectionnés'}
          >
            ✉ Envoyer message
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={busy}
            style={{ ...ghostBtnStyle, opacity: 0.7 }}
          >
            Annuler
          </button>
        </>
      ) : (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, opacity: 0.6 }}>
            Aucun sélectionné
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
        </>
      )}

      {/* Export CSV always available */}
      <a
        href={exportHref()}
        style={{
          padding: '6px 14px',
          background: 'var(--accent-primary)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--r-pill)',
          fontSize: 12,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        ⬇ Export CSV
      </a>

      {result && (
        <span style={{ fontSize: 12, color: 'var(--success, #4ade80)' }}>✓ {result}</span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: 'var(--danger)' }}>✗ {error}</span>
      )}

      {/* Round 27 #2 — Email composer modal */}
      {emailModal && (
        <EmailComposerModal
          recipientCount={selectedIds.size}
          subject={emailModal.subject}
          body={emailModal.body}
          busy={busy}
          onChange={(next) => setEmailModal(next)}
          onCancel={() => setEmailModal(null)}
          onSend={() => {
            const payload = emailModal;
            startTransition(async () => {
              setError(null);
              setResult(null);
              try {
                const res = await fetch('/api/admin/users/bulk', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'send-email',
                    userIds: Array.from(selectedIds),
                    subject: payload.subject,
                    body: payload.body,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setError(data.error ?? `HTTP ${res.status}`);
                  return;
                }
                setResult(`${data.affected ?? 0} email(s) envoyé(s)`);
                setEmailModal(null);
                clearSelection();
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Erreur réseau');
              }
            });
          }}
        />
      )}
    </div>
  );
}

function EmailComposerModal({
  recipientCount, subject, body, busy, onChange, onCancel, onSend,
}: {
  recipientCount: number;
  subject: string;
  body: string;
  busy: boolean;
  onChange: (next: { subject: string; body: string }) => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const canSend = subject.trim().length >= 3 && body.trim().length >= 10 && !busy;
  // Round 7 #1 — focus-trap : le modal est monté/démonté par le parent, donc
  // active = true sur toute sa vie ; le restore se fait au démontage.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);
  // Escape ferme le composer (parité avec le clic sur le backdrop).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Composer un email"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 24, color: 'var(--text-primary)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--r-xl)', padding: 24,
        maxWidth: 560, width: '100%', boxShadow: 'var(--shadow-xl)',
      }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 4px' }}>
          Email aux {recipientCount} utilisateur{recipientCount > 1 ? 's' : ''} sélectionné{recipientCount > 1 ? 's' : ''}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Filtre opt-out emailMarketing appliqué automatiquement (CASL).
        </p>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Objet
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => onChange({ subject: e.target.value.slice(0, 150), body })}
            placeholder="Promotion juin — 10 % sur cartes 14pt"
            maxLength={150}
            style={{ width: '100%', padding: 10, fontSize: 14, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', marginTop: 4, fontFamily: 'inherit' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Message · {body.length}/5000
          </span>
          <textarea
            value={body}
            onChange={(e) => onChange({ subject, body: e.target.value.slice(0, 5000) })}
            placeholder="Bonjour,&#10;&#10;On lance une promo..."
            rows={8}
            maxLength={5000}
            style={{ width: '100%', padding: 10, fontSize: 13, lineHeight: 1.5, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', marginTop: 4, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button" onClick={onCancel} disabled={busy}
            style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Annuler
          </button>
          <button
            type="button" onClick={onSend} disabled={!canSend}
            style={{ padding: '8px 16px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.5, fontFamily: 'inherit' }}
          >
            {busy ? 'Envoi…' : `Envoyer (${recipientCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}

const bulkBtnStyle: React.CSSProperties = {
  padding: '6px 14px',
  background: 'var(--accent-primary)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--r-pill)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  color: 'inherit',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 'var(--r-pill)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
