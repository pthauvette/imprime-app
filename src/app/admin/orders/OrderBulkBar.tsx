'use client';

/**
 * Sticky bulk action bar pour /admin/orders. S'attache aux checkboxes
 * existants (via leur data-order-id attribute), tracke la selection,
 * et expose des actions bulk via POST /api/admin/orders/bulk.
 *
 * Pourquoi ce design "wrap autour" plutôt que un Client Component qui
 * render toute la table : la page admin/orders est complexe (filtres,
 * stats, pagination) — la garder Server Component. Cette barre s'attache
 * au DOM via useEffect, lit les checkboxes, montre les actions.
 *
 * Actions pour MVP :
 *   - Ajouter une note admin commune à toutes les commandes
 *   - (futur) Export CSV des sélectionnées, mass message customer, etc.
 */

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function OrderBulkBar() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Attach handlers aux checkboxes au mount + sur navigation (pagination
  // change le DOM). useEffect re-run sur route change via router.refresh.
  useEffect(() => {
    function refreshSelection() {
      const checked = new Set<string>();
      document.querySelectorAll<HTMLInputElement>('input.ord-checkbox[data-order-id]:checked')
        .forEach((el) => {
          const id = el.dataset.orderId;
          if (id) checked.add(id);
        });
      setSelectedIds(checked);
    }

    function onChange(e: Event) {
      const t = e.target as HTMLInputElement;
      if (!t.classList.contains('ord-checkbox')) return;
      // Handle "select all" checkbox (no data-order-id) — toggles tous les
      // .ord-checkbox[data-order-id] enfants.
      if (!t.dataset.orderId) {
        document.querySelectorAll<HTMLInputElement>('input.ord-checkbox[data-order-id]')
          .forEach((cb) => { cb.checked = t.checked; });
      }
      refreshSelection();
    }

    document.addEventListener('change', onChange);
    refreshSelection(); // initial
    return () => document.removeEventListener('change', onChange);
  }, []);

  function clearSelection() {
    document.querySelectorAll<HTMLInputElement>('input.ord-checkbox')
      .forEach((cb) => { cb.checked = false; });
    setSelectedIds(new Set());
  }

  async function bulkNote() {
    if (selectedIds.size === 0) return;
    const note = window.prompt(`Ajouter une note admin à ${selectedIds.size} commande${selectedIds.size > 1 ? 's' : ''} :`, '');
    if (!note || !note.trim()) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/orders/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'note', ids: Array.from(selectedIds), note: note.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult(`Note ajoutée à ${data.count} commande${data.count > 1 ? 's' : ''}.`);
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function bulkResendConfirmation() {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    if (n > 50) {
      setError('Max 50 commandes par bulk resend (limite SES).');
      return;
    }
    if (!confirm(`Renvoyer l'email de confirmation à ${n} customer${n > 1 ? 's' : ''} ?\n\nNote : les orders PENDING ou FAILED seront ignorées.`)) {
      return;
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/orders/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resendConfirmation', ids: Array.from(selectedIds) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult(`${data.count} email${data.count > 1 ? 's' : ''} renvoyé${data.count > 1 ? 's' : ''}.`);
        clearSelection();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function bulkMarkStatus(status: 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED') {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    const label = { IN_PRODUCTION: 'EN PRODUCTION', SHIPPED: 'EXPÉDIÉES', DELIVERED: 'LIVRÉES' }[status];
    if (!confirm(`Marquer ${n} commande${n > 1 ? 's' : ''} comme ${label} ?\n\nNote : les orders déjà DELIVERED, CANCELLED ou FAILED seront ignorées (sécurité).`)) {
      return;
    }
    // Pour SHIPPED, prompt optionnel tracking + carrier (peuvent skip)
    let trackingNumber: string | undefined;
    let carrier: string | undefined;
    if (status === 'SHIPPED') {
      const t = window.prompt(`Tracking number commun (optionnel — vide = pas de tracking) :`, '');
      if (t && t.trim()) {
        trackingNumber = t.trim();
        const c = window.prompt('Transporteur ? (UPS / Canada Post / FedEx / Purolator)', 'UPS');
        if (c && c.trim()) carrier = c.trim();
      }
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/orders/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'markStatus',
            ids: Array.from(selectedIds),
            status,
            ...(trackingNumber ? { trackingNumber } : {}),
            ...(carrier ? { carrier } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult(`${data.count} commande${data.count > 1 ? 's' : ''} → ${label}.`);
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (selectedIds.size === 0 && !result && !error) return null;

  return (
    <div
      role="toolbar"
      aria-label="Actions bulk commandes"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--text-primary)',
        color: '#fff',
        padding: '12px 18px',
        borderRadius: 'var(--r-pill)',
        boxShadow: 'var(--shadow-xl)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 50,
        flexWrap: 'wrap',
        maxWidth: 'calc(100vw - 48px)',
      }}
    >
      {selectedIds.size > 0 && (
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
            {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <button
            type="button"
            disabled={busy}
            onClick={bulkNote}
            style={{
              padding: '6px 14px',
              background: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-pill)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Note admin
          </button>
          <StatusBtn label="⚙ En production" disabled={busy} onClick={() => bulkMarkStatus('IN_PRODUCTION')} />
          <StatusBtn label="📦 Expédiées" disabled={busy} onClick={() => bulkMarkStatus('SHIPPED')} />
          <StatusBtn label="✓ Livrées" disabled={busy} onClick={() => bulkMarkStatus('DELIVERED')} />
          <StatusBtn label="✉ Renvoyer confirmation" disabled={busy} onClick={bulkResendConfirmation} />
          <button
            type="button"
            onClick={clearSelection}
            disabled={busy}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: 'inherit',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 'var(--r-pill)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Annuler
          </button>
        </>
      )}
      {result && (
        <span style={{ fontSize: 12, color: 'var(--success, #4ade80)' }}>✓ {result}</span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: 'var(--danger)' }}>✗ {error}</span>
      )}
    </div>
  );
}

/** Bouton compact pour les status transitions bulk. Style ghost outline
 *  pour distinguer de l'action primary "Note admin". */
function StatusBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: 'transparent',
        color: 'inherit',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: 'var(--r-pill)',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
