'use client';

/**
 * Formulaire d'application au programme reseller. Client Component qui
 * POST /api/reseller/apply. Validation côté serveur via Zod, feedback
 * inline (success/error/duplicate).
 *
 * Champs : company, contact, email, phone?, website?, monthly volume?,
 * current solution?, project types?, message?. La plupart optionnels —
 * on veut maximiser le throughput, on creuse via email après.
 */

import { useState } from 'react';

export default function ResellerApplicationForm() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const estimatedRaw = String(form.get('estimatedMonthly') ?? '').trim();
    const estimated = estimatedRaw ? Math.round(Number(estimatedRaw) * 100) : undefined;
    const payload = {
      companyName: String(form.get('companyName') ?? '').trim(),
      contactName: String(form.get('contactName') ?? '').trim(),
      email: String(form.get('email') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim() || undefined,
      website: String(form.get('website') ?? '').trim() || undefined,
      estimatedMonthlyCents: estimated,
      currentSolution: String(form.get('currentSolution') ?? '').trim() || undefined,
      projectTypes: String(form.get('projectTypes') ?? '').trim() || undefined,
      message: String(form.get('message') ?? '').trim() || undefined,
    };
    try {
      const res = await fetch('/api/reseller/apply', {
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
        <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: '8px 0' }}>
          Application reçue.
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 auto', maxWidth: 480 }}>
          On regarde ton site / portfolio et on revient vers toi sous 1-2 jours ouvrables.
          Si on a des questions, on t&apos;écrit directement à l&apos;adresse fournie.
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Nom de l'entreprise" name="companyName" required maxLength={200} />
        <Field label="Personne contact" name="contactName" required maxLength={150} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Email" name="email" type="email" required maxLength={150} />
        <Field label="Téléphone (optionnel)" name="phone" type="tel" maxLength={30} />
      </div>
      <Field label="Site web / portfolio (optionnel)" name="website" type="url" placeholder="https://" maxLength={300} />

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Volume mensuel estimé en $ CAD (optionnel)</span>
        <input
          type="number"
          name="estimatedMonthly"
          min={0}
          step={50}
          placeholder="Ex: 2500"
          style={inputStyle}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Donne-nous une idée — pas grave si ça varie beaucoup d&apos;un mois à l&apos;autre.
        </span>
      </label>

      <Field label="Solution actuelle (optionnel)" name="currentSolution" placeholder="Ex: Vistaprint, imprimeur local…" maxLength={300} />

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Types de projets (optionnel)</span>
        <input
          type="text"
          name="projectTypes"
          placeholder="Ex: cartes de visite, brochures, flyers événements…"
          maxLength={300}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={labelStyle}>Quelque chose à nous dire ? (optionnel)</span>
        <textarea
          name="message"
          rows={4}
          maxLength={3000}
          placeholder="Contexte de ton studio, besoins particuliers, pourquoi Plio…"
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
        {submitting ? 'Envoi…' : 'Envoyer mon application →'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
        En postulant, tu acceptes qu&apos;on regarde ton site / portfolio pour valider la
        candidature. Aucune communication marketing sans ton accord.
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
      <span style={labelStyle}>{label}</span>
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
