'use client';

/**
 * Table emails avec checkbox multi + barre bulk pour retry plusieurs
 * FAILED/DEAD en une fois. Use case admin : Patrick a réglé SES, il veut
 * relancer les 12 emails DEAD d'un coup → click "Tout sélectionner" puis
 * "Bulk retry".
 *
 * Stratégie : on filtre les SENT (rien à faire) des sélectionnables.
 * "Tout sélectionner" sélectionne seulement les retryables visibles.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition, useMemo } from 'react';
import { formatDateTime } from '@/lib/format';
import { Icon } from '@/components/ui/Icon';
import EmailRetryButton from './EmailRetryButton';

export interface EmailListItem {
  id: string;
  status: string;
  to: string;
  template: string;
  label: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  sentAt: string | null;
}

const STATUS_BADGES: Record<string, { bg: string; color: string }> = {
  PENDING: { bg: 'var(--bg-sunken)', color: 'var(--text-muted)' },
  SENT: { bg: 'var(--success-soft, #f0fdf4)', color: 'var(--success, #16a34a)' },
  FAILED: { bg: 'var(--warning-soft, #FFF6E5)', color: 'var(--warning, #D97706)' },
  DEAD: { bg: 'var(--danger-soft)', color: 'var(--danger)' },
};

export default function EmailsBulkTable({ emails }: { emails: EmailListItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seuls FAILED/DEAD/PENDING sont retryables (SENT → skip silencieux côté API)
  const retryableIds = useMemo(
    () => emails.filter((e) => e.status !== 'SENT').map((e) => e.id),
    [emails],
  );
  const allSelected = retryableIds.length > 0 && selected.size === retryableIds.length;
  const noneSelected = selected.size === 0;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(retryableIds));
  }

  async function bulkRetry() {
    if (selected.size === 0) return;
    setError(null);
    setResult(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/emails/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult(
          `${data.sent}/${data.attempted} envoyés${data.failed > 0 ? ` · ${data.failed} échec${data.failed > 1 ? 's' : ''}` : ''}${data.skipped > 0 ? ` · ${data.skipped} skipped (déjà SENT)` : ''}.`,
        );
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (emails.length === 0) {
    return (
      <div style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Aucun email pour ce filtre.
      </div>
    );
  }

  return (
    <>
      {/* Toolbar bulk */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: retryableIds.length > 0 ? 'pointer' : 'default' }}>
          <input
            type="checkbox"
            disabled={retryableIds.length === 0}
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = !noneSelected && !allSelected; }}
            onChange={toggleAll}
          />
          {retryableIds.length === 0
            ? 'Aucun retryable'
            : allSelected ? `Tout désélectionner (${retryableIds.length})` : `Tout sélectionner les retryables (${retryableIds.length})`}
        </label>
        {selected.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
              · {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={bulkRetry}
              disabled={busy}
              style={{
                padding: '6px 14px',
                background: 'var(--accent-primary)',
                color: 'var(--text-on-accent, #fff)',
                border: 'none',
                borderRadius: 'var(--r-pill)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: busy ? 0.5 : 1,
                marginLeft: 'auto',
              }}
            >
              {busy ? 'Retry en cours…' : `⟳ Bulk retry (${selected.size})`}
            </button>
          </>
        )}
        {result && <span style={{ fontSize: 12, color: 'var(--success)' }}><Icon name="check" size={14} /> {result}</span>}
        {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}><Icon name="x" size={14} /> {error}</span>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th style={{ ...th, width: 32 }}></th>
            <th style={th}>Status</th>
            <th style={th}>Destinataire</th>
            <th style={th}>Template</th>
            <th style={th}>Label</th>
            <th style={{ ...th, textAlign: 'right' }}>Tentatives</th>
            <th style={th}>Créé</th>
            <th style={{ ...th, textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((e) => {
            const badge = STATUS_BADGES[e.status] ?? STATUS_BADGES.PENDING;
            const isRetryable = e.status !== 'SENT';
            const isSelected = selected.has(e.id);
            return (
              <tr
                key={e.id}
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--accent-soft)' : undefined,
                }}
              >
                <td style={{ ...td, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    disabled={!isRetryable}
                    checked={isSelected}
                    onChange={() => toggle(e.id)}
                    aria-label={`Sélectionner email ${e.id}`}
                  />
                </td>
                <td style={td}>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px',
                    background: badge.bg, color: badge.color,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                    borderRadius: 4,
                  }}>
                    {e.status}
                  </span>
                  {e.sentAt && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      envoyé {formatDateTime(e.sentAt)}
                    </div>
                  )}
                </td>
                <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.to}</td>
                <td style={td}>
                  <code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{e.template}</code>
                </td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{e.label ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {e.attempts} / {e.maxAttempts}
                </td>
                <td style={{ ...td, fontSize: 11, color: 'var(--text-muted)' }}>{formatDateTime(e.createdAt)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {(e.status === 'FAILED' || e.status === 'DEAD') && (
                    <EmailRetryButton id={e.id} status={e.status} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'top',
};
