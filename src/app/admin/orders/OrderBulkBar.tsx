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
  // Round 41 #2 — Inline forms au lieu de window.prompt × 3 (mobile-unusable).
  // 'note' = bulk note. 'ship' = tracking + carrier combinés (avant : 2 prompts
  // chaînés affreux — maintenant 1 seul form avec les 2 champs).
  const [openForm, setOpenForm] = useState<null | 'note' | 'ship'>(null);
  const [noteText, setNoteText] = useState('');
  const [trackingText, setTrackingText] = useState('');
  const [carrierText, setCarrierText] = useState('UPS');
  // shipPending : commande à exécuter une fois le ship form submitted.
  const [shipPendingCount, setShipPendingCount] = useState(0);

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

  function openNoteForm() {
    if (selectedIds.size === 0) return;
    setNoteText('');
    setError(null);
    setResult(null);
    setOpenForm('note');
  }

  async function submitNoteForm(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = noteText.trim();
    if (!trimmed) {
      setError('Note requise');
      return;
    }
    setOpenForm(null);
    setError(null);
    setResult(null);
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/orders/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'note', ids, note: trimmed }),
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
    // Round 41 #2 — Pour SHIPPED, on ouvre un inline form combiné (tracking +
    // carrier en 1 fois) au lieu de 2 prompts chaînés (l'ancien flow était
    // catastrophique sur mobile : 2 modals natifs, no default carrier visible).
    if (status === 'SHIPPED') {
      setTrackingText('');
      setCarrierText('UPS');
      setShipPendingCount(n);
      setError(null);
      setResult(null);
      setOpenForm('ship');
      return;
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

  async function submitShipForm(e: React.FormEvent) {
    e.preventDefault();
    const tracking = trackingText.trim();
    const carrier = carrierText.trim();
    setOpenForm(null);
    setError(null);
    setResult(null);
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/orders/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'markStatus',
            ids,
            status: 'SHIPPED',
            // Tracking + carrier optional — only sent if both have value
            ...(tracking ? { trackingNumber: tracking } : {}),
            ...(tracking && carrier ? { carrier } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setResult(`${data.count} commande${data.count > 1 ? 's' : ''} → EXPÉDIÉES.`);
        clearSelection();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (selectedIds.size === 0 && !result && !error) return null;

  return (
    <>
      {/* Round 41 #2 — Inline form pour bulkNote (was window.prompt) */}
      {openForm === 'note' && (
        <form
          onSubmit={submitNoteForm}
          style={{
            position: 'fixed',
            bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-md)',
            padding: 16,
            boxShadow: 'var(--shadow-xl)',
            display: 'grid',
            gap: 10,
            zIndex: 49,
            width: 'min(420px, calc(100vw - 32px))',
          }}
        >
          <label htmlFor="orders-bulk-note" style={{ fontSize: 12, fontWeight: 600 }}>
            Ajouter une note admin
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
              {selectedIds.size} commande{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          </label>
          <textarea
            id="orders-bulk-note"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Ex : Vérifié avec le client le 25, OK pour produire"
            rows={3}
            maxLength={1000}
            autoFocus
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', resize: 'vertical' }}
            disabled={busy}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setOpenForm(null)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{ padding: '6px 12px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {busy ? '⏳ …' : `Ajouter à ${selectedIds.size}`}
            </button>
          </div>
        </form>
      )}

      {/* Round 41 #2 — Inline form pour bulkShip (was 2 chained window.prompt).
          Tracking + carrier combinés en 1 form. Les deux optionnels :
          si tracking vide → ship sans tracking. */}
      {openForm === 'ship' && (
        <form
          onSubmit={submitShipForm}
          style={{
            position: 'fixed',
            bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-md)',
            padding: 16,
            boxShadow: 'var(--shadow-xl)',
            display: 'grid',
            gap: 10,
            zIndex: 49,
            width: 'min(420px, calc(100vw - 32px))',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            Marquer {shipPendingCount} commande{shipPendingCount > 1 ? 's' : ''} comme EXPÉDIÉES
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
              Tracking + transporteur optionnels — laisse vide si pas applicable
            </span>
          </div>
          <div>
            <label htmlFor="orders-bulk-tracking" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Tracking commun (optionnel)
            </label>
            <input
              id="orders-bulk-tracking"
              type="text"
              value={trackingText}
              onChange={(e) => setTrackingText(e.target.value)}
              placeholder="Ex : 1Z999AA10123456784"
              maxLength={100}
              autoFocus
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
              disabled={busy}
            />
          </div>
          <div>
            <label htmlFor="orders-bulk-carrier" style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
              Transporteur
            </label>
            <select
              id="orders-bulk-carrier"
              value={carrierText}
              onChange={(e) => setCarrierText(e.target.value)}
              disabled={busy || !trackingText.trim()}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', background: 'var(--bg-canvas)' }}
            >
              <option value="UPS">UPS</option>
              <option value="Canada Post">Canada Post</option>
              <option value="FedEx">FedEx</option>
              <option value="Purolator">Purolator</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setOpenForm(null)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{ padding: '6px 12px', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {busy ? '⏳ …' : `Marquer ${shipPendingCount} expédiée${shipPendingCount > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      )}

      <div
        role="toolbar"
        aria-label="Actions bulk commandes"
        style={{
          position: 'fixed',
          // Round 40 #4 — iOS Safari bottom URL bar overlaps fixed:bottom elements.
          // env(safe-area-inset-bottom) = 0 on non-notched devices, 34px on iPhone X+.
          bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
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
            onClick={openNoteForm}
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
    </>
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
