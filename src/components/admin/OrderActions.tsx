'use client';

/**
 * Action panel pour /admin/orders/[id]. Wired to POST endpoints.
 *
 * Toutes les actions :
 *   - Demandent une confirmation native (prompt pour refund/cancel — capture
 *     reason + amount partial). Pas de modal fancy pour MVP.
 *   - POST l'endpoint correspondant
 *   - Refresh le router pour re-render la page avec les nouveaux events
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  orderId: string;
  status: string;
  amountCents: number;
  hasSinaliteId: boolean;
}

export default function OrderActions({ orderId, status, amountCents, hasSinaliteId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canRefund = status !== 'PENDING' && status !== 'CANCELLED' && status !== 'FAILED';
  const canReplay = !hasSinaliteId && status !== 'PENDING' && status !== 'CANCELLED';
  const canCancel = status !== 'SHIPPED' && status !== 'DELIVERED' && status !== 'CANCELLED' && status !== 'FAILED';

  async function call(label: string, path: string, body?: Record<string, unknown>) {
    setBusy(label);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setSuccess(`✓ ${label} OK`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setBusy(null);
    }
  }

  function handleResend() {
    void call('Email renvoyé', `/api/admin/orders/${orderId}/resend-confirmation`);
  }

  function handleReplay() {
    if (!confirm("Re-soumettre cette commande à Sinalite ? Crée une nouvelle order côté Sinalite.")) return;
    void call('Replay Sinalite', `/api/admin/orders/${orderId}/replay-sinalite`);
  }

  function handleRefund() {
    const maxCad = (amountCents / 100).toFixed(2);
    const amountStr = prompt(
      `Montant à rembourser en $ CAD (max ${maxCad}) — vide = full refund`,
      maxCad,
    );
    if (amountStr === null) return;
    const reason = prompt('Raison du refund (visible dans l\'audit log) ?', 'Geste commercial');
    if (!reason) return;
    const amountCentsBody = amountStr.trim() === '' ? undefined : Math.round(parseFloat(amountStr) * 100);
    void call('Refund émis', `/api/admin/orders/${orderId}/refund`, {
      amountCents: amountCentsBody,
      reason,
    });
  }

  function handleCancel() {
    const reason = prompt(
      'Raison de l\'annulation (visible client + audit log) ?',
      'Stock épuisé — non disponible',
    );
    if (!reason) return;
    if (!confirm(`Annuler la commande + full refund ?\n\nRaison : ${reason}`)) return;
    void call('Commande annulée', `/api/admin/orders/${orderId}/cancel`, { reason });
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <ActionBtn
        label="✉ Renvoyer la confirmation"
        onClick={handleResend}
        busy={busy === 'Email renvoyé'}
      />
      <ActionBtn
        label={hasSinaliteId ? "↻ Déjà soumis à Sinalite" : "↻ Soumettre à Sinalite"}
        onClick={handleReplay}
        busy={busy === 'Replay Sinalite'}
        disabled={!canReplay}
      />

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '8px 0' }} />
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--danger)',
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        Zone dangereuse
      </div>
      <ActionBtn
        label="💰 Émettre un refund (partial OK)"
        onClick={handleRefund}
        busy={busy === 'Refund émis'}
        disabled={!canRefund}
        danger
      />
      <ActionBtn
        label="✕ Annuler + full refund"
        onClick={handleCancel}
        busy={busy === 'Commande annulée'}
        disabled={!canCancel}
        danger
      />

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: 'var(--success-soft)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color: 'var(--success)',
          }}
        >
          {success}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  busy,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      style={{
        textAlign: 'left',
        padding: '8px 12px',
        background: 'transparent',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--r-sm)',
        fontSize: 13,
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--danger)' : 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 500,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {busy ? '⏳ ' + label : label}
    </button>
  );
}
