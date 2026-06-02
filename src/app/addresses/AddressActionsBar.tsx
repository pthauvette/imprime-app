'use client';

/**
 * Toolbar avec bouton "Ajouter une adresse" + actions par card (edit, delete,
 * make default). Pour MVP on remplace l'ancien bouton disabled de la page,
 * et on s'attache aux cards via portal-style overlay buttons.
 *
 * Pattern : la page Server Component liste les addresses + leurs data-address-id ;
 * ce composant React monte des handlers DOM et un modal AddressForm.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AddressForm from './AddressForm';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface AddressData {
  id: string;
  kind: 'SHIPPING' | 'BILLING';
  label: string | null;
  isDefault: boolean;
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string | null;
}

export default function AddressActionsBar({ addresses }: { addresses: AddressData[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [editing, setEditing] = useState<AddressData | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function action(id: string, body: Record<string, unknown> | null, method: 'PATCH' | 'DELETE', label: string) {
    // Round 9 #2 — confirmation seulement pour le destructif (DELETE), via modal
    // stylé. « Faire défaut » (PATCH set-default) est RÉVERSIBLE → plus de confirm.
    if (method === 'DELETE') {
      const ok = await confirm({
        title: `${label} ?`,
        body: 'Cette action est irréversible.',
        confirmLabel: 'Supprimer',
        danger: true,
      });
      if (!ok) return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/addresses/${id}`, {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <>
      {dialog}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="btn btn-primary btn-sm"
          disabled={busy}
        >
          + Ajouter une adresse
        </button>
        {error && (
          <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
        )}
      </div>

      {/* Per-row actions appended below each card via flex grid */}
      <div style={{ display: 'grid', gap: 12 }}>
        {addresses.map((addr) => (
          <div
            key={addr.id}
            style={{
              padding: 16,
              background: 'var(--bg-surface)',
              border: `1px solid ${addr.isDefault ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--r-lg)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: 14 }}>
                  {addr.kind === 'BILLING' ? '📄' : '📦'} {addr.label ?? (addr.kind === 'BILLING' ? 'Facturation' : 'Expédition')}
                </strong>
                {addr.isDefault && (
                  <span style={{ marginLeft: 12, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                    ★ Défaut
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {addr.kind}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong>{addr.firstName} {addr.lastName}</strong>{addr.company ? ` · ${addr.company}` : ''}<br />
              {addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}<br />
              {addr.city}, {addr.province} {addr.postalCode}
              {addr.phone && <><br /><span style={{ color: 'var(--text-muted)' }}>📞 {addr.phone}</span></>}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {!addr.isDefault && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => action(addr.id, { action: 'set-default' }, 'PATCH', `Définir cette adresse comme défaut ${addr.kind}`)}
                >
                  ★ Faire défaut
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => setEditing(addr)}
              >
                ✎ Modifier
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)' }}
                disabled={busy}
                onClick={() => action(addr.id, null, 'DELETE', 'Supprimer cette adresse')}
              >
                🗑 Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {creating && <AddressForm onClose={() => setCreating(false)} />}
      {editing && <AddressForm initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
