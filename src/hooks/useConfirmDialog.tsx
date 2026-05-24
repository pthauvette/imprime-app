'use client';

/**
 * useConfirmDialog — replace native window.confirm() avec un modal styled.
 *
 * Round 36 #5. Audit Round 35+1 a identifié 11 occurrences de window.confirm()
 * incohérentes avec les modals custom existants (PipedaDeleteButton,
 * CancelRequestButton). Native confirm() est jarring + bloque le main thread
 * + ne respecte pas le theme/locale.
 *
 * Usage minimal :
 *
 *   const { confirm, dialog } = useConfirmDialog();
 *
 *   async function handleDelete() {
 *     const ok = await confirm({
 *       title: 'Supprimer cette commande ?',
 *       body: 'Cette action est irréversible.',
 *       confirmLabel: 'Supprimer',
 *       danger: true,
 *     });
 *     if (!ok) return;
 *     // ... proceed
 *   }
 *
 *   return (
 *     <>
 *       <button onClick={handleDelete}>Delete</button>
 *       {dialog}
 *     </>
 *   );
 *
 * Returns une promise<boolean> qui resolve true (confirm) / false (cancel).
 * Le modal est rendu inline (pas de portal) — caller doit insérer {dialog}
 * dans son JSX (ou pas, le rendering kicks in seulement quand open).
 */

import { useState, useCallback } from 'react';

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style danger (rouge) pour les actions destructives. */
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleClose = useCallback((ok: boolean) => {
    if (pending) {
      pending.resolve(ok);
      setPending(null);
    }
  }, [pending]);

  const dialog = pending ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(false); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'var(--bg-canvas)',
          borderRadius: 'var(--r-lg)',
          padding: 24,
          maxWidth: 440,
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h2
          id="confirm-dialog-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 500,
            margin: '0 0 12px',
            color: pending.danger ? 'var(--danger)' : 'var(--text-primary)',
          }}
        >
          {pending.title}
        </h2>
        {pending.body && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {pending.body}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => handleClose(false)}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            {pending.cancelLabel ?? 'Annuler'}
          </button>
          <button
            type="button"
            onClick={() => handleClose(true)}
            autoFocus
            style={{
              padding: '8px 14px',
              background: pending.danger ? 'var(--danger)' : 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {pending.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
