'use client';

/**
 * Liste de reviews avec selection multi + barre d'actions bulk.
 *
 *  - Checkbox par row, click sur le card sélectionne aussi (UX rapide)
 *  - "Tout sélectionner" en haut (toggle entre 0/all)
 *  - Bulk bar sticky en bas quand selection > 0 : Approuver / Rejeter /
 *    Featured / Désélectionner
 *  - POST /api/admin/reviews/bulk avec les IDs cochés
 *  - Refresh la page après succès
 *
 * Server-side : la page passe les reviews déjà fetched + filter actif.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition, useMemo } from 'react';
import { formatDateTime } from '@/lib/format';
import ReviewActions from './ReviewActions';
import ReviewReplyForm from './ReviewReplyForm';

export interface ReviewListItem {
  id: string;
  rating: number;
  displayName: string;
  comment: string | null;
  status: string;
  isFeatured: boolean;
  adminNote: string | null;
  // Round 25 #4 — réponse publique admin (Trustpilot-style)
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
  orderId: string;
  order: {
    sinaliteOrderId: string | null;
    productSummary: string | null;
    amountCents: number;
    user: { email: string };
  };
}

export default function ReviewsBulkList({
  reviews,
  filter,
}: {
  reviews: ReviewListItem[];
  filter: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  // Round 41 #2 — Inline rejection form au lieu de window.prompt (mobile-unusable).
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const allIds = useMemo(() => reviews.map((r) => r.id), [reviews]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;
  const noneSelected = selected.size === 0;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  async function bulk(action: 'approve' | 'reject' | 'feature', extra?: Record<string, unknown>) {
    if (selected.size === 0) return;
    setError(null);
    setLastResult(null);
    const ids = Array.from(selected);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/reviews/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids, ...extra }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setLastResult(`${data.count} review${data.count > 1 ? 's' : ''} ${labelForAction(action, extra)}.`);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function openRejectForm() {
    setRejectReason('');
    setError(null);
    setRejectOpen(true);
  }

  async function submitRejectForm(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = rejectReason.trim();
    setRejectOpen(false);
    await bulk('reject', { adminNote: trimmed || undefined });
  }

  async function bulkFeature(on: boolean) {
    await bulk('feature', { isFeatured: on });
  }

  if (reviews.length === 0) {
    return (
      <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Aucune review pour ce filtre.
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 4px', marginBottom: 8 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = !noneSelected && !allSelected; }}
            onChange={toggleAll}
          />
          {allSelected ? `Tout désélectionner (${reviews.length})` : `Tout sélectionner (${reviews.length})`}
        </label>
        {selected.size > 0 && (
          <span style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600 }}>
            · {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
          </span>
        )}
        {lastResult && (
          <span style={{ fontSize: 12, color: 'var(--success)', marginLeft: 'auto' }}>✓ {lastResult}</span>
        )}
        {error && (
          <span style={{ fontSize: 12, color: 'var(--danger)', marginLeft: 'auto' }}>✗ {error}</span>
        )}
      </div>

      {/* List */}
      <div style={{ display: 'grid', gap: 12, paddingBottom: selected.size > 0 ? 90 : 0 }}>
        {reviews.map((r) => {
          const isSelected = selected.has(r.id);
          return (
            <div
              key={r.id}
              className="adm-panel"
              style={{
                padding: 22,
                display: 'grid',
                gridTemplateColumns: '24px 1fr',
                gap: 16,
                border: isSelected ? '1px solid var(--accent-primary)' : undefined,
                background: isSelected ? 'var(--accent-soft)' : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(r.id)}
                aria-label={`Sélectionner review ${r.id}`}
                style={{ marginTop: 6 }}
              />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontSize: 24 }}>
                      {'★'.repeat(r.rating)}<span style={{ color: 'var(--border-default)' }}>{'★'.repeat(5 - r.rating)}</span>
                    </span>
                    <strong style={{ fontSize: 15 }}>{r.displayName}</strong>
                    {r.isFeatured && (
                      <span style={{ padding: '2px 8px', background: 'var(--accent-soft)', color: 'var(--accent-primary)', fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, borderRadius: 4 }}>
                        ★ Featured
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {formatDateTime(r.createdAt)}
                  </div>
                </div>

                {r.comment && (
                  <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', fontStyle: 'italic' }}>
                    « {r.comment} »
                  </p>
                )}

                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Order #{r.order.sinaliteOrderId ?? r.orderId.slice(-6).toUpperCase()} · {r.order.productSummary ?? '—'} · {(r.order.amountCents / 100).toFixed(2)} $ · {r.order.user.email}
                </div>

                {r.adminNote && (
                  <div style={{ marginTop: 8, padding: 10, background: 'var(--danger-soft)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--danger)' }}>
                    <strong>Note rejet :</strong> {r.adminNote}
                  </div>
                )}

                <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                  <ReviewActions id={r.id} status={r.status} isFeatured={r.isFeatured} />
                </div>

                {/* Round 25 #4 — réponse publique admin. Seulement pour
                    les reviews APPROVED (les autres ne sont pas visibles
                    sur la landing, donc reply n'a pas de sens). */}
                {r.status === 'APPROVED' && (
                  <ReviewReplyForm
                    reviewId={r.id}
                    existingReply={r.adminReply}
                    existingReplyAt={r.adminReplyAt}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Round 41 #2 — Inline rejection form (above bulk bar) */}
      {rejectOpen && selected.size > 0 && (
        <form
          onSubmit={submitRejectForm}
          style={{
            position: 'fixed',
            bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            padding: 16,
            boxShadow: 'var(--shadow-xl)',
            display: 'grid',
            gap: 10,
            zIndex: 49,
            width: 'min(420px, calc(100vw - 32px))',
          }}
        >
          <label htmlFor="reviews-bulk-reject" style={{ fontSize: 12, fontWeight: 600 }}>
            Raison du rejet (optionnel, pour audit)
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
              {selected.size} review{selected.size > 1 ? 's' : ''} sélectionnée{selected.size > 1 ? 's' : ''}
            </span>
          </label>
          <textarea
            id="reviews-bulk-reject"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ex : Contenu inapproprié / spam"
            rows={3}
            maxLength={500}
            autoFocus
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', resize: 'vertical' }}
            disabled={busy}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              style={{ padding: '6px 12px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy ? 0.5 : 1 }}
            >
              {busy ? '⏳ …' : `Rejeter ${selected.size}`}
            </button>
          </div>
        </form>
      )}

      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div
          role="toolbar"
          aria-label="Actions bulk"
          style={{
            position: 'fixed',
            // Round 40 #4 backfill — iOS safe-area for the bottom indicator
            bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--text-primary)',
            color: 'var(--text-on-accent, #fff)',
            padding: '12px 18px',
            borderRadius: 'var(--r-pill)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 50,
            flexWrap: 'wrap',
            maxWidth: 'calc(100vw - 48px)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
            {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          {filter !== 'APPROVED' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => bulk('approve')}
              style={bulkBtnStyle('var(--success, #16a34a)')}
            >
              ✓ Approuver
            </button>
          )}
          {filter !== 'REJECTED' && (
            <button
              type="button"
              disabled={busy}
              onClick={openRejectForm}
              style={bulkBtnStyle('var(--danger)')}
            >
              ✗ Rejeter
            </button>
          )}
          {filter === 'APPROVED' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => bulkFeature(true)}
                style={bulkBtnStyle('var(--accent-primary)')}
              >
                ★ Featured
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => bulkFeature(false)}
                style={bulkBtnStyle('var(--text-muted)')}
              >
                ☆ Unfeature
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
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
              opacity: busy ? 0.5 : 1,
            }}
          >
            Annuler
          </button>
        </div>
      )}
    </>
  );
}

function labelForAction(action: string, extra?: Record<string, unknown>): string {
  if (action === 'approve') return 'approuvée(s)';
  if (action === 'reject') return 'rejetée(s)';
  if (action === 'feature') return extra?.isFeatured ? 'mise(s) en avant' : 'retirée(s) du featured';
  return 'modifiée(s)';
}

function bulkBtnStyle(bg: string): React.CSSProperties {
  return {
    padding: '6px 14px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-pill)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
