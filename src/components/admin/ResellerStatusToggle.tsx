'use client';

/**
 * ResellerStatusToggle — admin control inline pour /admin/users/[id].
 *
 * Round 22 #1. 3 boutons radio : NONE / AUTO_DETECTED / VERIFIED.
 * Confirm dialog avant flip vers/depuis VERIFIED (action sensible —
 * débloque les perks au checkout = revenue impact).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'NONE' | 'AUTO_DETECTED' | 'VERIFIED';

interface Props {
  userId: string;
  initialStatus: Status;
}

const STATUS_META: Record<Status, { label: string; description: string; color: string }> = {
  NONE: {
    label: 'Aucun',
    description: 'Pas de statut reseller — pas de perks',
    color: 'var(--text-muted)',
  },
  AUTO_DETECTED: {
    label: '~ Détecté auto',
    description: '5+ orders/365j — candidat reseller (perks NON débloqués)',
    color: '#5B7A6A',
  },
  VERIFIED: {
    label: '✓ Vérifié',
    description: 'Validé par admin — perks ACTIVES (5% discount auto)',
    color: '#1F3D2B',
  },
};

export default function ResellerStatusToggle({ userId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function applyStatus(next: Status) {
    if (next === status) return;

    // Confirm if flipping to/from VERIFIED (revenue impact)
    const isSensitive = next === 'VERIFIED' || status === 'VERIFIED';
    if (isSensitive) {
      const msg = next === 'VERIFIED'
        ? `Valider ce user comme reseller vérifié ?\n\nEffet : 5 % discount auto au prochain checkout. Action visible dans /admin/audit.`
        : `Révoquer le statut VERIFIED de ce user ?\n\nEffet : plus de perks au prochain checkout. Le user peut être re-détecté AUTO si > 5 orders/365j (mais pas VERIFIED).`;
      if (!window.confirm(msg)) return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/reseller-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setStatus(next);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['NONE', 'AUTO_DETECTED', 'VERIFIED'] as const).map((s) => {
          const meta = STATUS_META[s];
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => applyStatus(s)}
              disabled={busy}
              title={meta.description}
              style={{
                padding: '6px 12px',
                background: active ? meta.color : 'var(--bg-canvas)',
                color: active ? '#fff' : 'var(--text-primary)',
                border: `1px solid ${active ? meta.color : 'var(--border-default)'}`,
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                fontWeight: active ? 700 : 500,
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
        {STATUS_META[status].description}
      </p>
      {error && (
        <span role="alert" style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>
      )}
    </div>
  );
}
