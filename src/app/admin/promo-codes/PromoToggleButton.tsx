'use client';

/**
 * Toggle inline `active` d'un PromoCode via PATCH /api/admin/promo-codes/[id].
 * Optimistic UI : flip immédiatement, revert si l'API échoue.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

export default function PromoToggleButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [optimisticActive, setOptimisticActive] = useState(active);

  async function handleToggle() {
    if (busy) return;
    const next = !optimisticActive;
    // Audit admin 2026-07 §5.11 — désactiver un code ACTIF casse les paniers en
    // cours qui le portent : confirmation avant le clic destructif (l'activation,
    // elle, reste directe — réversible et sans dégât).
    if (!next && !(await confirm({
      title: 'Désactiver ce code promo ?',
      body: 'Les clients qui l\'ont dans un panier en cours ne pourront plus l\'appliquer au paiement.',
      confirmLabel: 'Désactiver',
      danger: true,
    }))) {
      return;
    }
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
    <>
      {dialog}
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
    </>
  );
}
