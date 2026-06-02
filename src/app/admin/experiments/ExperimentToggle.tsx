'use client';

/**
 * Toggle on/off d'une expérience A/B. Optimistic UI : on flip immédiatement
 * puis on revert si l'API fail.
 *
 * Confirme avant de désactiver une expérience qui était active (les data
 * collectées doivent être figées avant changement).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface Props {
  experimentId: string;
  currentlyActive: boolean;
}

export default function ExperimentToggle({ experimentId, currentlyActive }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [optimistic, setOptimistic] = useState(currentlyActive);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function toggle() {
    const next = !optimistic;
    // Confirm avant désactivation (risque de perdre le contexte des conversions)
    if (optimistic && !(await confirm({ title: `Désactiver « ${experimentId} » ?`, body: 'Tous les visiteurs verront le control. À utiliser quand l’expérience est conclue.', confirmLabel: 'Désactiver', danger: true }))) {
      return;
    }

    setError(null);
    setOptimistic(next); // optimistic flip

    try {
      const res = await fetch(`/api/admin/experiments/${experimentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        setOptimistic(currentlyActive); // revert
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau');
      setOptimistic(currentlyActive);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      {dialog}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={optimistic ? 'Cliquer pour désactiver' : 'Cliquer pour activer'}
        style={{
          padding: '8px 18px',
          background: optimistic ? 'var(--accent-primary)' : 'var(--bg-canvas)',
          color: optimistic ? 'white' : 'var(--text-muted)',
          border: `1px solid ${optimistic ? 'var(--accent-primary)' : 'var(--border-default)'}`,
          borderRadius: 'var(--r-pill)',
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: pending ? 'wait' : 'pointer',
          opacity: pending ? 0.6 : 1,
          transition: 'all 0.15s',
          minWidth: 100,
        }}
      >
        {pending ? '⏳' : optimistic ? '● ON' : '○ OFF'}
      </button>
      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger, #dc2626)', maxWidth: 200, textAlign: 'right' }}>
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
