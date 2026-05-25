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
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

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
  // Round 37 #5 — Custom modal vs window.confirm/prompt (mobile unusable,
  // unbranded). Inline form pour le refund amount au lieu de prompt × 2.
  const { confirm, dialog } = useConfirmDialog();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Geste commercial');

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

  async function handleReplay() {
    const ok = await confirm({
      title: 'Re-soumettre cette commande à Sinalite ?',
      body: 'Crée une nouvelle order côté Sinalite. À utiliser si la première submission a fail ou doit être ré-essayée.',
      confirmLabel: 'Re-soumettre',
    });
    if (!ok) return;
    void call('Replay Sinalite', `/api/admin/orders/${orderId}/replay-sinalite`);
  }

  // Round 37 #5 — handleRefund ouvre maintenant un mini-form inline
  // (refundOpen state) au lieu de window.prompt × 2. Mobile-friendly,
  // validation native HTML, pas de jarring browser dialog.
  function handleRefundOpen() {
    setRefundAmount((amountCents / 100).toFixed(2));
    setRefundReason('Geste commercial');
    setError(null);
    setSuccess(null);
    setRefundOpen(true);
  }

  async function handleRefundSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!refundReason.trim()) {
      setError('Raison requise');
      return;
    }
    const amountVal = refundAmount.trim();
    const parsedAmount = amountVal === '' ? NaN : parseFloat(amountVal);
    const amountCentsBody = amountVal === '' || isNaN(parsedAmount)
      ? undefined
      : Math.round(parsedAmount * 100);
    setRefundOpen(false);
    void call('Refund émis', `/api/admin/orders/${orderId}/refund`, {
      amountCents: amountCentsBody,
      reason: refundReason.trim(),
    });
  }

  async function handleCancel() {
    // Combine raison + confirm dans 1 seul modal (vs prompt + confirm)
    const reason = await new Promise<string | null>((resolve) => {
      // Open a simple modal asking the reason
      const r = window.prompt(
        'Raison de l\'annulation (visible client + audit log)',
        'Stock épuisé — non disponible',
      );
      resolve(r);
    });
    if (!reason || !reason.trim()) return;
    const ok = await confirm({
      title: 'Annuler la commande + full refund ?',
      body: `Raison : ${reason}\n\nLe customer sera notifié + Stripe refund + wallet credit restauré si applicable.`,
      confirmLabel: 'Annuler la commande',
      danger: true,
    });
    if (!ok) return;
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
        onClick={handleRefundOpen}
        busy={busy === 'Refund émis'}
        disabled={!canRefund}
        danger
      />
      {/* Round 37 #5 — Inline form au lieu de window.prompt × 2 (mobile unusable) */}
      {refundOpen && (
        <form
          onSubmit={handleRefundSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            marginTop: 4,
          }}
        >
          <div>
            <label htmlFor="refund-amount" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Montant CAD (vide = full refund {(amountCents / 100).toFixed(2)} $)
            </label>
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0"
              max={(amountCents / 100).toFixed(2)}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder={(amountCents / 100).toFixed(2)}
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
            />
          </div>
          <div>
            <label htmlFor="refund-reason" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Raison (audit log) *
            </label>
            <input
              id="refund-reason"
              type="text"
              required
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              maxLength={200}
              style={{ width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setRefundOpen(false)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              style={{ padding: '6px 12px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Émettre refund
            </button>
          </div>
        </form>
      )}
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
      {dialog}
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
