'use client';

/**
 * ResellerStatusToggle — admin control inline pour /admin/users/[id].
 *
 * Round 22 #1. 3 boutons radio : NONE / AUTO_DETECTED / VERIFIED.
 * Confirm dialog avant flip vers/depuis VERIFIED (action sensible —
 * débloque les perks au checkout = revenue impact).
 */

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';

// Round 33 — ajout PLATINUM tier (10 % off, > 20 000 $ /365j)
type Status = 'NONE' | 'AUTO_DETECTED' | 'VERIFIED' | 'PLATINUM';

interface Props {
  userId: string;
  initialStatus: Status;
}

const STATUS_META: Record<Status, { label: ReactNode; description: string; color: string }> = {
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
    label: <><Icon name="check" size={12} /> Vérifié</>,
    description: 'Validé par admin — perks ACTIVES (5 % discount auto)',
    color: '#1F3D2B',
  },
  PLATINUM: {
    label: '◆ PLATINUM',
    description: 'High-volume reseller (≥ 20 000 $ /365j) — 10 % discount + priority production',
    color: '#4F4F50',
  },
};

export default function ResellerStatusToggle({ userId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Round 36 #5 — Custom modal au lieu de window.confirm() jarring.
  const { confirm, dialog } = useConfirmDialog();

  async function applyStatus(next: Status) {
    if (next === status) return;

    // Confirm if flipping to/from VERIFIED or PLATINUM (revenue impact)
    const isSensitive =
      next === 'VERIFIED' || next === 'PLATINUM' || status === 'VERIFIED' || status === 'PLATINUM';
    if (isSensitive) {
      const { title, body, isDanger } = next === 'PLATINUM'
        ? {
            title: 'Promouvoir ce user au statut PLATINUM ?',
            body: 'Effet : 10 % discount auto + badge priority. Normalement attribué auto par le cron mensuel quand le user atteint 20 000 $/365j.',
            isDanger: false,
          }
        : next === 'VERIFIED'
          ? {
              title: 'Valider ce user comme reseller vérifié ?',
              body: 'Effet : 5 % discount auto au prochain checkout. Action visible dans /admin/audit.',
              isDanger: false,
            }
          : status === 'PLATINUM'
            ? {
                title: 'Révoquer le statut PLATINUM ?',
                body: 'Effet : retour au tier choisi (VERIFIED garde le 5 %, NONE perd tout). Action visible dans /admin/audit.',
                isDanger: true,
              }
            : {
                title: 'Révoquer le statut VERIFIED de ce user ?',
                body: 'Effet : plus de perks au prochain checkout. Le user peut être re-détecté AUTO si > 5 orders/365j (mais pas VERIFIED).',
                isDanger: true,
              };
      const ok = await confirm({
        title,
        body,
        confirmLabel: isDanger ? 'Révoquer' : 'Confirmer',
        danger: isDanger,
      });
      if (!ok) return;
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
        {(['NONE', 'AUTO_DETECTED', 'VERIFIED', 'PLATINUM'] as const).map((s) => {
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
      {dialog}
    </div>
  );
}
