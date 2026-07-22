'use client';

/**
 * Formulaire de demande de devis sur-mesure. POST /api/quote/request.
 *
 * Champs minimaux requis : name, email, projectType, description (assez
 * long pour qu'on puisse réfléchir). Le reste est optionnel pour
 * minimiser la friction.
 */

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function QuoteRequestForm() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const budgetRaw = String(form.get('budget') ?? '').trim();
    const budgetCents = budgetRaw ? Math.round(Number(budgetRaw) * 100) : undefined;
    const payload = {
      name: String(form.get('name') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim() || undefined,
      companyName: String(form.get('companyName') ?? '').trim() || undefined,
      projectType: String(form.get('projectType') ?? '').trim(),
      estimatedQuantity: String(form.get('estimatedQuantity') ?? '').trim() || undefined,
      deadline: String(form.get('deadline') ?? '').trim() || undefined,
      budgetCents,
      description: String(form.get('description') ?? '').trim(),
    };
    try {
      const res = await fetch('/api/quote/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        role="status"
        style={{
          padding: 32,
          background: 'var(--success-soft, #f0fdf4)',
          border: '1px solid var(--success, #16a34a)',
          borderRadius: 'var(--r-xl)',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: 8 }}><Icon name="check" size={44} /></div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: '8px 0' }}>
          Demande reçue.
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 auto', maxWidth: 480 }}>
          On regarde ton projet et on revient vers toi sous 1-2 jours ouvrables avec un quote
          détaillé. Si on a besoin de précisions, on t&apos;écrit directement.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        padding: 28,
        background: 'var(--bg-surface)',
        border: '1px solid var(--accent-primary)',
        borderRadius: 'var(--r-xl)',
        display: 'grid',
        gap: 16,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        <Field label="Ton nom" name="name" required maxLength={150} />
        <Field label="Email" name="email" type="email" required maxLength={150} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        <Field label="Téléphone (optionnel)" name="phone" type="tel" maxLength={30} />
        <Field label="Entreprise (optionnel)" name="companyName" maxLength={200} />
      </div>

      <Field
        label="Type de projet"
        name="projectType"
        required
        placeholder="Ex: signage extérieur, packaging custom, papier non-standard…"
        maxLength={200}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        <Field label="Quantité estimée (optionnel)" name="estimatedQuantity" placeholder="500-1000" maxLength={100} />
        <Field label="Deadline (optionnel)" name="deadline" placeholder="Mi-juillet" maxLength={100} />
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Budget approximatif en $ CAD (optionnel)</span>
        <input
          type="number"
          name="budget"
          min={0}
          step={50}
          placeholder="Ex: 1500"
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Pas grave si tu n&apos;as pas d&apos;idée — on te donne plusieurs options de prix.
        </span>
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Décris ton projet *</span>
        <textarea
          name="description"
          rows={6}
          required
          minLength={20}
          maxLength={5000}
          placeholder="Format, papier souhaité, couleurs, finitions (laminage, vernis, embossage), assemblage, livraison… Plus c'est précis, plus le quote est précis."
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>

      {error && (
        <div role="alert" style={{ padding: 12, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary"
        style={{ opacity: submitting ? 0.6 : 1 }}
      >
        {submitting ? 'Envoi…' : 'Envoyer ma demande →'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
        Réponse sous 1-2 jours ouvrables. Aucune communication marketing sans ton accord.
      </p>
    </form>
  );
}

function Field({
  label, name, type = 'text', required, placeholder, maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{label}{required ? ' *' : ''}</span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        style={inputStyle}
      />
    </label>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  fontSize: 14,
  font: 'inherit',
  background: 'var(--bg-canvas)',
  color: 'var(--text-primary)',
};
