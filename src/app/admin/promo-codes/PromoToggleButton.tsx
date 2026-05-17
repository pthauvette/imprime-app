'use client';

/**
 * Toggle inline `active` d'un PromoCode via PATCH /api/admin/promo-codes/[id].
 * Optimistic UI : flip immédiatement, revert si l'API échoue.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PromoToggleButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [optimisticActive, setOptimisticActive] = useState(active);

  async function handleToggle() {
    const next = !optimisticActive;
    setBusy(true);
    setOptimisticActive(next);
    try {
      const res = await fetch(`/api/admin/promo-codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) {
        setOptimisticActive(active); // revert
        throw new Error(`HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      console.error('[promo toggle]', err);
      setOptimisticActive(active); // revert on error
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={busy}
      style={{
        padding: '4px 12px',
        background: optimisticActive ? 'var(--success-soft, #f0fdf4)' : 'var(--bg-sunken)',
        color: optimisticActive ? 'var(--success, #16a34a)' : 'var(--text-muted)',
        border: `1px solid ${optimisticActive ? 'var(--success, #16a34a)' : 'var(--border-default)'}`,
        borderRadius: 'var(--r-sm)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {optimisticActive ? '● Actif' : '○ Désactivé'}
    </button>
  );
}
