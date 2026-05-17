'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ReviewActions({ id, status, isFeatured }: { id: string; status: string; isFeatured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(action: 'approve' | 'reject' | 'feature', body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {status === 'PENDING' && (
        <>
          <button
            onClick={() => void call('approve')}
            disabled={busy}
            style={btnStyle('var(--success, #16a34a)', 'var(--success-soft, #f0fdf4)')}
          >
            ✓ Approuver
          </button>
          <button
            onClick={() => {
              const reason = prompt('Raison du rejet (optionnel, pour audit) ?');
              if (reason !== null) void call('reject', { adminNote: reason || undefined });
            }}
            disabled={busy}
            style={btnStyle('var(--danger)', 'var(--danger-soft)')}
          >
            ✗ Rejeter
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
            {isFeatured ? '★ Retirer featured' : '☆ Marquer featured'}
          </button>
          <button
            onClick={() => {
              if (confirm('Re-mettre cette review en attente de modération ?')) {
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
          ↻ Restaurer + Approuver
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
