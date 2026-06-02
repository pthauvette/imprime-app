'use client';

/**
 * TaxExemptToggle — toggle inline + cert ID input pour /admin/users/[id].
 *
 * Round 18 #5. Sur enable : prompt cert ID (TPS/TVQ exemption number).
 * Sur disable : confirm puis nullifie. Audit log côté API.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

interface Props {
  userId: string;
  initialExempt: boolean;
  initialCertId: string | null;
}

export default function TaxExemptToggle({ userId, initialExempt, initialCertId }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [exempt, setExempt] = useState(initialExempt);
  const [certId, setCertId] = useState(initialCertId ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(nextExempt: boolean, nextCertId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}/tax-exempt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taxExempt: nextExempt,
            taxExemptCertId: nextExempt ? nextCertId.trim() : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setExempt(nextExempt);
        setCertId(nextExempt ? nextCertId.trim() : '');
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (editing) {
    return (
      <div style={{ padding: 14, background: 'var(--bg-sunken)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--r-md)', display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Active le statut tax-exempt. Le certificat est archivé pour audit fiscal.
        </div>
        <input
          type="text"
          value={certId}
          onChange={(e) => setCertId(e.target.value)}
          placeholder="Numéro cert TPS / TVQ / autre (ex: 1006030022 TQ0001)"
          minLength={3}
          maxLength={100}
          autoFocus
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
          }}
          disabled={busy}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => toggle(true, certId)}
            disabled={busy || certId.trim().length < 3}
            className="btn btn-primary btn-sm"
            style={{ flex: 1 }}
          >
            {busy ? 'Activation…' : 'Activer + enregistrer cert'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={busy} className="btn btn-ghost btn-sm">
            Annuler
          </button>
        </div>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </div>
    );
  }

  if (exempt) {
    return (
      <div style={{ padding: 14, background: 'var(--accent-soft)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--r-md)' }}>
        {dialog}
        <div style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600, marginBottom: 4 }}>
          ✓ Tax-exempt actif
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
          Cert : <strong style={{ color: 'var(--text-primary)' }}>{certId || '(non-renseigné)'}</strong>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (await confirm({ title: 'Désactiver le statut tax-exempt ?', body: `Le certificat ${certId} sera nullifié.`, confirmLabel: 'Désactiver', danger: true })) {
              toggle(false, '');
            }
          }}
          disabled={busy}
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--danger)' }}
        >
          Désactiver
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)', marginLeft: 8 }} role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div style={{ padding: 14, background: 'var(--bg-sunken)', border: '1px dashed var(--border-default)', borderRadius: 'var(--r-md)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        Standard (TPS + TVQ appliqués au checkout)
      </div>
      <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost btn-sm">
        Activer tax-exempt (B2B reseller / cas spécial)
      </button>
    </div>
  );
}
