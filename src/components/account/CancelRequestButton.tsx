'use client';

/**
 * Bouton + modal "Demander l'annulation" sur /orders/[id] customer.
 *
 * NE FAIT PAS un cancel automatique — envoie un email à l'admin avec la
 * raison du client. L'admin tranche dans les minutes/heures qui suivent
 * (vérifie avec la presse si production déjà commencée, refund Stripe).
 *
 * Visible uniquement pour status PAID, SUBMITTED ou IN_PRODUCTION (le
 * parent décide via la prop `eligible`).
 */

import { useState } from 'react';

export default function CancelRequestButton({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const eligible = status === 'PAID' || status === 'SUBMITTED' || status === 'IN_PRODUCTION';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  if (!eligible) return null;

  const canSubmit = reason.trim().length >= 10 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFeedback({
        ok: true,
        message: "Demande envoyée. On revient vers toi dans 1-2 heures ouvrables.",
      });
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 18px',
          background: 'transparent',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-md)',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Demander l&apos;annulation
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-canvas)',
        borderRadius: 'var(--r-lg)',
        padding: 24,
        width: '100%',
        maxWidth: 520,
        boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
        display: 'grid',
        gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400 }}>
            Demander l&apos;annulation
          </h3>
          <button onClick={() => setOpen(false)} style={{ fontSize: 22, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>

        {!feedback?.ok && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {status === 'PAID' ? (
                <>La commande est payée mais pas encore envoyée à la presse — annulation rapide possible.</>
              ) : status === 'SUBMITTED' ? (
                <>La commande a été envoyée à notre presse mais la production n&apos;a peut-être pas commencé. On va vérifier et te répondre dans 1-2 heures ouvrables.</>
              ) : (
                <>La production a déjà commencé. On va vérifier auprès de notre presse si l&apos;annulation est encore possible et te répondre dans 1-2 heures ouvrables.</>
              )}
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Pourquoi tu veux annuler ? (min 10 caractères)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={2000}
                rows={5}
                autoFocus
                placeholder="Ex: J'ai cliqué sur acheter par erreur · J'ai trouvé un autre fournisseur · L'événement est annulé · Le quantité est mauvaise..."
                style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', minHeight: 120 }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
                {reason.length} / 2000
              </span>
            </label>
          </>
        )}

        {feedback && (
          <div style={{
            padding: '12px 14px',
            background: feedback.ok ? 'var(--success-soft, #f0fdf4)' : 'var(--danger-soft)',
            border: `1px solid ${feedback.ok ? 'var(--success, #16a34a)' : 'var(--danger)'}`,
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: feedback.ok ? 'var(--success, #16a34a)' : 'var(--danger)',
          }}>
            {feedback.ok ? '✓' : '✗'} {feedback.message}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          {feedback?.ok ? (
            <button onClick={() => setOpen(false)} className="btn btn-secondary btn-sm" style={{ padding: '8px 18px' }}>
              Fermer
            </button>
          ) : (
            <>
              <button onClick={() => setOpen(false)} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{ padding: '8px 18px', background: canSubmit ? 'var(--danger)' : 'var(--bg-sunken)', color: canSubmit ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: 'var(--r-sm)', cursor: canSubmit ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600 }}
              >
                {submitting ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
