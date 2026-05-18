'use client';

/**
 * Form pour create/edit une adresse. Mode "create" → POST /api/addresses,
 * mode "edit" → PATCH /api/addresses/[id] avec action='update'.
 *
 * Affiché en modal-like : revealed via setVisible(true) depuis AddNew button
 * ou Edit button. onClose() ferme + refresh la page.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface AddressInput {
  kind: 'SHIPPING' | 'BILLING';
  label?: string | null;
  isDefault?: boolean;
  firstName: string;
  lastName: string;
  company?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone?: string | null;
}

interface Props {
  initial?: (AddressInput & { id: string }) | null;
  onClose: () => void;
}

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];

export default function AddressForm({ initial, onClose }: Props) {
  const router = useRouter();
  const isEdit = !!initial;
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const payload: AddressInput = {
      kind: form.get('kind') as 'SHIPPING' | 'BILLING',
      label: (form.get('label') as string) || undefined,
      isDefault: form.get('isDefault') === 'on',
      firstName: form.get('firstName') as string,
      lastName: form.get('lastName') as string,
      company: (form.get('company') as string) || undefined,
      line1: form.get('line1') as string,
      line2: (form.get('line2') as string) || undefined,
      city: form.get('city') as string,
      province: form.get('province') as string,
      postalCode: form.get('postalCode') as string,
      phone: (form.get('phone') as string) || undefined,
    };

    setError(null);
    startTransition(async () => {
      try {
        const res = isEdit
          ? await fetch(`/api/addresses/${initial.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update', ...payload }),
            })
          : await fetch('/api/addresses', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        onClose();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflow: 'auto',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--bg-canvas, #fff)',
          padding: 28,
          borderRadius: 'var(--r-xl)',
          maxWidth: 560,
          width: '100%',
          display: 'grid',
          gap: 14,
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, margin: 0 }}>
          {isEdit ? 'Modifier l\'adresse' : 'Nouvelle adresse'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Type" name="kind">
            <select name="kind" defaultValue={initial?.kind ?? 'SHIPPING'} style={inputStyle} required>
              <option value="SHIPPING">Expédition</option>
              <option value="BILLING">Facturation</option>
            </select>
          </Field>
          <Field label="Libellé (optionnel)" name="label">
            <input name="label" type="text" defaultValue={initial?.label ?? ''} placeholder="Bureau, Maison…" maxLength={60} style={inputStyle} />
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Prénom" name="firstName">
            <input name="firstName" type="text" defaultValue={initial?.firstName ?? ''} maxLength={80} style={inputStyle} required />
          </Field>
          <Field label="Nom" name="lastName">
            <input name="lastName" type="text" defaultValue={initial?.lastName ?? ''} maxLength={80} style={inputStyle} required />
          </Field>
        </div>

        <Field label="Entreprise (optionnel)" name="company">
          <input name="company" type="text" defaultValue={initial?.company ?? ''} maxLength={120} style={inputStyle} />
        </Field>

        <Field label="Adresse" name="line1">
          <input name="line1" type="text" defaultValue={initial?.line1 ?? ''} maxLength={200} style={inputStyle} required />
        </Field>

        <Field label="Appartement / suite (optionnel)" name="line2">
          <input name="line2" type="text" defaultValue={initial?.line2 ?? ''} maxLength={200} style={inputStyle} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <Field label="Ville" name="city">
            <input name="city" type="text" defaultValue={initial?.city ?? ''} maxLength={100} style={inputStyle} required />
          </Field>
          <Field label="Province" name="province">
            <select name="province" defaultValue={initial?.province ?? 'QC'} style={inputStyle} required>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Code postal" name="postalCode">
            <input name="postalCode" type="text" defaultValue={initial?.postalCode ?? ''} placeholder="A1A 1A1" style={inputStyle} required />
          </Field>
        </div>

        <Field label="Téléphone (optionnel — utile pour la livraison)" name="phone">
          <input name="phone" type="tel" defaultValue={initial?.phone ?? ''} maxLength={30} style={inputStyle} />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
          <input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault ?? false} />
          Définir comme adresse par défaut pour ce type
        </label>

        {error && (
          <div role="alert" style={{ padding: 10, background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 'var(--r-sm)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn btn-ghost" disabled={busy}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sauvegarde…' : isEdit ? 'Sauvegarder' : 'Ajouter'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, children }: { label: string; name: string; children: React.ReactNode }) {
  return (
    <label htmlFor={name} style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </span>
      {children}
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
