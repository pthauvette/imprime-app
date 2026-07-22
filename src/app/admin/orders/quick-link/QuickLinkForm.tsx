'use client';

/**
 * Form pour /admin/orders/quick-link. Inputs simples : email client +
 * productId + optionIds (comma-separated) + note. POST → backend valide
 * que le product existe côté Sinalite avant d'envoyer l'email.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function QuickLinkForm() {
  const [customerEmail, setCustomerEmail] = useState('');
  const [productId, setProductId] = useState('');
  const [optionIdsStr, setOptionIdsStr] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<
    | { ok: true; deepLink: string; to: string }
    | { ok: false; message: string }
    | null
  >(null);

  const optionIds = optionIdsStr
    .split(/[,\s]+/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  const canSubmit =
    customerEmail.includes('@') &&
    /^\d+$/.test(productId.trim()) &&
    optionIds.length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/orders/quick-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: customerEmail.trim(),
          productId: parseInt(productId.trim(), 10),
          optionIds,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFeedback({ ok: true, deepLink: data.deepLink, to: data.to });
      // Reset les champs sensibles (garde productId si admin envoie plusieurs liens
      // pour le même produit à différents clients)
      setCustomerEmail('');
      setNote('');
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <Field label="Email du client">
        <input
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          required
          autoComplete="off"
          placeholder="client@example.ca"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 14 }}>
        <Field label="Product ID Sinalite">
          <input
            type="number"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            min={1}
            placeholder="Ex: 1"
            style={inputStyle}
          />
        </Field>
        <Field label={`Option IDs (séparés par virgule) — ${optionIds.length} parsé(s)`}>
          <input
            value={optionIdsStr}
            onChange={(e) => setOptionIdsStr(e.target.value)}
            required
            placeholder="Ex: 4, 30, 107, 224, 78, 5"
            autoComplete="off"
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }}
          />
        </Field>
      </div>

      <Field label="Note pour le client (optionnel)">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Ex: J'ai pris le format 14pt avec UV recto-verso comme on a parlé. Le total sera autour de 180$ avec la livraison à Drummondville."
          style={{ ...inputStyle, lineHeight: 1.5, resize: 'vertical', minHeight: 80 }}
        />
      </Field>

      {feedback?.ok && (
        <div style={{ padding: '12px 14px', background: 'var(--success-soft, #f0fdf4)', border: '1px solid var(--success, #16a34a)', borderRadius: 'var(--r-md)', fontSize: 13, display: 'grid', gap: 8 }}>
          <div style={{ color: 'var(--success, #16a34a)', fontWeight: 600 }}>
            <Icon name="check" size={14} /> Email envoyé à <strong>{feedback.to}</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
            Deep-link : <a href={feedback.deepLink} target="_blank" rel="noopener" style={{ color: 'var(--accent-primary)' }}>{feedback.deepLink}</a>
          </div>
        </div>
      )}
      {feedback && !feedback.ok && (
        <div style={{ padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--danger)' }}>
          <Icon name="x" size={14} /> {feedback.message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn btn-primary btn-sm"
          style={{ opacity: canSubmit ? 1 : 0.5, padding: '10px 18px' }}
        >
          {submitting ? 'Envoi…' : 'Envoyer au client →'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  fontSize: 13,
  width: '100%',
  background: 'var(--bg-canvas)',
};
