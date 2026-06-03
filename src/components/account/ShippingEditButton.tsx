'use client';

/**
 * Bouton + modal "Modifier l'adresse de livraison" sur /orders/[id].
 *
 * Round 32. Visible uniquement status=PAID (avant SUBMITTED Sinalite).
 * Submit → PATCH /api/orders/[id]/shipping → success → router.refresh().
 *
 * Pas d'édit pour shipProvince (changerait la tax déjà chargée Stripe —
 * out of scope, devrait passer par cancel + recreate).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

interface Props {
  orderId: string;
  status: string;
  current: {
    shipName: string;
    shipLine1: string;
    shipLine2: string | null;
    shipCity: string;
    shipProvince: string;
    shipPostalCode: string;
    shipPhone: string;
  };
}

export default function ShippingEditButton({ orderId, status, current }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Audit v2 #9.4 — Escape + focus-trap + restore focus sur le modal d'édition.
  const dialogRef = useModalFocusTrap<HTMLDivElement>(open, () => setOpen(false));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    shipName: current.shipName,
    shipLine1: current.shipLine1,
    shipLine2: current.shipLine2 ?? '',
    shipCity: current.shipCity,
    shipPostalCode: current.shipPostalCode,
    shipPhone: current.shipPhone,
  });

  // Status check : seulement PAID (pas encore submitted à Sinalite)
  if (status !== 'PAID') return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/shipping`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          shipLine2: form.shipLine2.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 18px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-md)',
          textAlign: 'center',
          fontSize: 14,
          color: 'var(--text-primary)',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        ✏️ Modifier l&apos;adresse de livraison
      </button>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ship-edit-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              background: 'var(--bg-canvas)',
              borderRadius: 'var(--r-lg)',
              padding: 24,
              maxWidth: 480,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h2 id="ship-edit-title" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, margin: '0 0 8px' }}>
              Modifier la livraison
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              Tu peux changer l&apos;adresse avant qu&apos;on soumette à l&apos;imprimeur (généralement &lt; 1 h). La <strong>province</strong> ne peut pas changer (taxe déjà calculée) — contacte-nous si nécessaire.
            </p>

            <Field label="Nom complet" name="shipName" value={form.shipName} onChange={(v) => setForm({ ...form, shipName: v })} required />
            <Field label="Adresse" name="shipLine1" value={form.shipLine1} onChange={(v) => setForm({ ...form, shipLine1: v })} required />
            <Field label="Appartement / suite (optionnel)" name="shipLine2" value={form.shipLine2} onChange={(v) => setForm({ ...form, shipLine2: v })} />
            <Field label="Ville" name="shipCity" value={form.shipCity} onChange={(v) => setForm({ ...form, shipCity: v })} required />
            <Field label="Code postal (CA)" name="shipPostalCode" value={form.shipPostalCode} onChange={(v) => setForm({ ...form, shipPostalCode: v })} required placeholder="H2X 1Y4" />
            <Field label="Téléphone" name="shipPhone" value={form.shipPhone} onChange={(v) => setForm({ ...form, shipPhone: v })} required type="tel" />

            <div style={{ padding: '8px 12px', background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Province actuelle : <strong>{current.shipProvince}</strong> (non modifiable)
            </div>

            {error && (
              <div role="alert" style={{ padding: '8px 12px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12, borderRadius: 'var(--r-sm)', marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                style={{ padding: '10px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-md)', cursor: 'pointer', fontSize: 13 }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: '10px 16px',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--r-md)',
                  cursor: submitting ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={name} style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
      </label>
      <input
        id={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 14,
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-sm)',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
