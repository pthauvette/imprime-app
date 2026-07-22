'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';

export default function ReviewActions({ id, status, isFeatured }: { id: string; status: string; isFeatured: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  // Round 30 #5 — Avant: alert() pour les erreurs. Maintenant: inline error
  // banner cohérent avec OrderActions.tsx, dismissible, FR.
  const [error, setError] = useState<string | null>(null);

  async function call(action: 'approve' | 'reject' | 'feature', body: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Erreur HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {dialog}
      {error && (
        <div
          role="alert"
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
            fontSize: 11,
            borderRadius: 'var(--r-sm)',
            marginBottom: 4,
          }}
        >
          {error}
        </div>
      )}
      {status === 'PENDING' && (
        <>
          <button
            onClick={() => void call('approve')}
            disabled={busy}
            style={btnStyle('var(--success, #16a34a)', 'var(--success-soft, #f0fdf4)')}
          >
            <Icon name="check" size={14} /> Approuver
          </button>
          <button
            onClick={() => {
              const reason = prompt('Raison du rejet (optionnel, pour audit) ?');
              if (reason !== null) void call('reject', { adminNote: reason || undefined });
            }}
            disabled={busy}
            style={btnStyle('var(--danger)', 'var(--danger-soft)')}
          >
            <Icon name="x" size={14} /> Rejeter
          </button>
        </>
      )}
      {status === 'APPROVED' && (
        <>
          <button
            onClick={() => void call('feature', { isFeatured: !isFeatured })}
            disabled={busy}
            style={btnStyle('var(--accent-primary)', 'var(--accent-soft)')}
          >
            {isFeatured ? <><Icon name="star" size={14} /> Retirer featured</> : <><Icon name="star" size={14} /> Marquer featured</>}
          </button>
          <button
            onClick={async () => {
              if (await confirm({ title: 'Re-mettre cette review en modération ?', confirmLabel: 'Remodérer', danger: true })) {
                void call('reject', { adminNote: 'Re-modération' });
              }
            }}
            disabled={busy}
            style={btnStyle('var(--text-muted)', 'var(--bg-sunken)')}
          >
            Remodérer
          </button>
        </>
      )}
      {status === 'REJECTED' && (
        <button
          onClick={() => void call('approve')}
          disabled={busy}
          style={btnStyle('var(--success, #16a34a)', 'var(--success-soft, #f0fdf4)')}
        >
          <Icon name="refresh" size={14} /> Restaurer + Approuver
        </button>
      )}
    </div>
  );
}

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: bg,
    color,
    border: `1px solid ${color}`,
    borderRadius: 'var(--r-sm)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  };
}
