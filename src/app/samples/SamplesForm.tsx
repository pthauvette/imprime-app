'use client';

/**
 * Formulaire interactif pour /samples : selection des échantillons + shipping form.
 *
 *  - Grid de cards (papiers + finitions), click toggle la sélection
 *  - Compteur "X de 5 sélectionnés"
 *  - Bouton "Continuer" enable seulement si ≥ 1 sample sélectionné
 *  - Click ouvre le shipping form (collapsible)
 *  - Submit POST /api/samples → success state ou erreur
 */

import { useState } from 'react';

export interface SampleOption {
  key: string;
  name: string;
  desc: string;
  spec: string;
  /** CSS class pour le swatch visuel (coated14, uv, foil, etc.). */
  swatchClass: string;
  badge?: string;
}

const PROVINCES = [
  { code: 'QC', name: 'Québec' },
  { code: 'ON', name: 'Ontario' },
  { code: 'BC', name: 'Colombie-Britannique' },
  { code: 'AB', name: 'Alberta' },
  { code: 'MB', name: 'Manitoba' },
  { code: 'SK', name: 'Saskatchewan' },
  { code: 'NS', name: 'Nouvelle-Écosse' },
  { code: 'NB', name: 'Nouveau-Brunswick' },
  { code: 'NL', name: 'Terre-Neuve-et-Labrador' },
  { code: 'PE', name: 'Île-du-Prince-Édouard' },
  { code: 'NT', name: 'Territoires du Nord-Ouest' },
  { code: 'NU', name: 'Nunavut' },
  { code: 'YT', name: 'Yukon' },
];

export default function SamplesForm({
  papers, finishes, max,
}: {
  papers: SampleOption[];
  finishes: SampleOption[];
  max: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < max) {
        next.add(key);
      } else {
        // Limite atteinte — pas d'ajout. Pourrait flash un toast mais on
        // garde simple, le compteur indique déjà la limite.
        return s;
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get('email') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim() || undefined,
      shipLine1: String(form.get('shipLine1') ?? '').trim(),
      shipLine2: String(form.get('shipLine2') ?? '').trim() || undefined,
      shipCity: String(form.get('shipCity') ?? '').trim(),
      shipProvince: String(form.get('shipProvince') ?? ''),
      shipPostalCode: String(form.get('shipPostalCode') ?? '').trim(),
      message: String(form.get('message') ?? '').trim() || undefined,
      selectedSamples: Array.from(selected),
    };
    try {
      const res = await fetch('/api/samples', {
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
          padding: 40,
          background: 'var(--success-soft, #f0fdf4)',
          border: '1px solid var(--success, #16a34a)',
          borderRadius: 'var(--r-xl)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 56, marginBottom: 8 }}>✓</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 400, margin: '8px 0' }}>
          Demande reçue, <em>merci !</em>
        </h2>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto', lineHeight: 1.5 }}>
          On te prépare le kit ({selected.size} échantillon{selected.size > 1 ? 's' : ''}) — livraison sous 5 jours
          ouvrables par Postes Canada. Un courriel de suivi suivra dès l&apos;envoi.
        </p>
        <a href="/order/start" className="btn btn-primary" style={{ marginTop: 24 }}>
          Démarrer une commande en attendant →
        </a>
      </div>
    );
  }

  return (
    <>
      {/* Compteur sticky */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          padding: '12px 18px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-md)',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, color: 'var(--accent-primary)' }}>
          {selected.size}
        </strong>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          sélectionné{selected.size > 1 ? 's' : ''} sur {max} disponibles
        </span>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          disabled={selected.size === 0}
          className="btn btn-primary"
          style={{ marginLeft: 'auto', opacity: selected.size === 0 ? 0.5 : 1 }}
        >
          {showForm ? 'Cacher le formulaire' : 'Continuer →'}
        </button>
      </div>

      {/* Selected chips */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          {Array.from(selected).map((k, i) => (
            <span
              key={k}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                background: 'var(--accent-soft)',
                color: 'var(--accent-primary)',
                borderRadius: 'var(--r-pill)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>{String(i + 1).padStart(2, '0')}</span>
              {k}
            </span>
          ))}
        </div>
      )}

      {/* Papiers */}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: '24px 0 12px' }}>
        Papiers <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>· {papers.length} stocks</span>
      </h2>
      <div className="sample-grid">
        {papers.map((p) => (
          <SampleCard key={p.key} option={p} selected={selected.has(p.key)} onClick={() => toggle(p.key)} />
        ))}
      </div>

      {/* Finitions */}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: '40px 0 12px' }}>
        Finitions spéciales <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>· {finishes.length} effets</span>
      </h2>
      <div className="sample-grid">
        {finishes.map((f) => (
          <SampleCard key={f.key} option={f} selected={selected.has(f.key)} onClick={() => toggle(f.key)} />
        ))}
      </div>

      {/* Shipping form (collapsible) */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          style={{
            marginTop: 40,
            padding: 28,
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-xl)',
            display: 'grid',
            gap: 16,
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, margin: 0 }}>
            Où on t&apos;envoie ça ?
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Gratuit. Pas d&apos;abonnement. On t&apos;envoie 1 courriel de suivi quand
            c&apos;est expédié, c&apos;est tout.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Nom complet" name="name" required maxLength={150} />
            <Field label="Email" name="email" type="email" required maxLength={150} />
          </div>
          <Field label="Téléphone (optionnel)" name="phone" type="tel" maxLength={30} />
          <Field label="Adresse" name="shipLine1" required maxLength={200} />
          <Field label="Appartement / suite (optionnel)" name="shipLine2" maxLength={200} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <Field label="Ville" name="shipCity" required maxLength={100} />
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Province
              </span>
              <select name="shipProvince" required defaultValue="QC" style={inputStyle}>
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>{p.code} · {p.name}</option>
                ))}
              </select>
            </label>
            <Field label="Code postal" name="shipPostalCode" required placeholder="H2X 1A1" maxLength={7} />
          </div>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
              Quelque chose à nous dire ? (optionnel)
            </span>
            <textarea
              name="message"
              rows={3}
              maxLength={2000}
              placeholder="Type de projet à venir, contraintes, questions techniques…"
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
            disabled={submitting || selected.size === 0}
            className="btn btn-primary"
            style={{ opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Envoi…' : `Envoyer mes ${selected.size} échantillon${selected.size > 1 ? 's' : ''} →`}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
            On garde ton email + adresse pour traiter cette demande. Aucun spam.
          </p>
        </form>
      )}
    </>
  );
}

function SampleCard({
  option, selected, onClick,
}: {
  option: SampleOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sample-card${selected ? ' selected' : ''}`}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid',
        borderColor: selected ? 'var(--accent-primary)' : 'var(--border-subtle)',
        borderRadius: 'var(--r-lg)',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        display: 'grid',
      }}
    >
      <div className={`sample-swatch ${option.swatchClass}`} style={{ position: 'relative', height: 90 }}>
        {option.badge && (
          <span
            style={{
              position: 'absolute', top: 8, left: 8,
              padding: '3px 8px', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              background: 'rgba(255,255,255,0.92)', color: 'var(--text-primary)',
              borderRadius: 4, fontFamily: 'var(--font-mono)',
            }}
          >
            {option.badge}
          </span>
        )}
        {selected && (
          <span
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--accent-primary)', color: 'var(--text-on-accent, #fff)',
              display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700,
            }}
          >
            ✓
          </span>
        )}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{option.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 8 }}>
          {option.desc}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
          {option.spec}
        </div>
      </div>
    </button>
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
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </span>
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

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
  fontSize: 14,
  font: 'inherit',
  background: 'var(--bg-canvas)',
  color: 'var(--text-primary)',
};
