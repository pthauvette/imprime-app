'use client';

/**
 * Form de création de code promo. Pas de modal — inline sous le header
 * de la page admin pour réduire les clicks (admin va créer 1-2 codes par
 * mois, pas la peine d'un modal lourd).
 *
 * Validation client-side minimale — le serveur re-valide via le zod
 * schema dans /api/admin/promo-codes.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type DiscountKind = 'pct' | 'cents';

export default function PromoCreateForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<DiscountKind>('pct');
  const [discountValue, setDiscountValue] = useState('10');
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [minSubtotal, setMinSubtotal] = useState('');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const body: Record<string, unknown> = {
      code: code.trim(),
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(firstOrderOnly ? { firstOrderOnly: true } : {}),
    };

    const dv = parseFloat(discountValue);
    if (kind === 'pct') body.discountPct = Math.round(dv);
    else body.discountCents = Math.round(dv * 100);

    if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
    if (maxUses) body.maxUses = parseInt(maxUses, 10);
    if (minSubtotal) body.minSubtotalCents = Math.round(parseFloat(minSubtotal) * 100);

    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setFeedback({ ok: true, message: `✓ Code "${data.promo.code}" créé.` });
      // Reset
      setCode('');
      setLabel('');
      setDiscountValue('10');
      setExpiresAt('');
      setMaxUses('');
      setMinSubtotal('');
      setFirstOrderOnly(false);
      router.refresh();
    } catch (err) {
      setFeedback({ ok: false, message: err instanceof Error ? err.message : 'Erreur' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, maxWidth: 720 }}>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 2fr' }}>
        <Field label="Code (ex: BIENVENUE10)">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoComplete="off"
            maxLength={64}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
          />
        </Field>
        <Field label="Label admin (interne, optionnel)">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
            placeholder="Ex: Campagne newsletter mai 2026"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '120px 1fr 1fr' }}>
        <Field label="Type">
          <select value={kind} onChange={(e) => setKind(e.target.value as DiscountKind)} style={inputStyle}>
            <option value="pct">% rabais</option>
            <option value="cents">$ fixe</option>
          </select>
        </Field>
        <Field label={kind === 'pct' ? 'Pourcentage (1-100)' : 'Montant ($)'}>
          <input
            type="number"
            min={1}
            max={kind === 'pct' ? 100 : undefined}
            step={kind === 'pct' ? 1 : 0.01}
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Subtotal min ($) — optionnel">
          <input
            type="number"
            min={0}
            step={0.01}
            value={minSubtotal}
            onChange={(e) => setMinSubtotal(e.target.value)}
            placeholder="Ex: 50.00"
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <Field label="Expire le — optionnel">
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Max utilisations — optionnel">
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="Ex: 100"
            style={inputStyle}
          />
        </Field>
        <Field label="">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingTop: 28 }}>
            <input
              type="checkbox"
              checked={firstOrderOnly}
              onChange={(e) => setFirstOrderOnly(e.target.checked)}
            />
            Première commande seulement
          </label>
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
        {feedback && (
          <span style={{ fontSize: 12, color: feedback.ok ? 'var(--success, #16a34a)' : 'var(--danger)' }}>
            {feedback.message}
          </span>
        )}
        <button type="submit" disabled={submitting || !code.trim()} className="btn btn-primary btn-sm" style={{ opacity: submitting || !code.trim() ? 0.5 : 1 }}>
          {submitting ? 'Création…' : 'Créer le code'}
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
