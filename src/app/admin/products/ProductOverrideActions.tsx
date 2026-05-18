'use client';

/**
 * Actions inline pour gérer l'override admin d'un produit Sinalite.
 *
 *  - Toggle "Disabled" : cache le produit du catalogue customer (sans
 *    modifier Sinalite). Useful pour des produits qu'on ne veut pas vendre
 *    via Plio même si Sinalite les active.
 *  - Toggle "Featured" : badge "★" sur la card customer (heuristique nom-based
 *    actuellement, mais override admin prime).
 *  - Edit displayName : ouvre un prompt (basique pour MVP) — futur :
 *    modal avec markdown + description override.
 *
 * Tout passe par PUT /api/admin/products/[id] qui upsert l'override + audit.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Props {
  productId: number;
  productName: string;
  override: {
    disabled: boolean;
    featured: boolean;
    displayName: string | null;
    marginPct: number | null;
  } | null;
}

export default function ProductOverrideActions({ productId, productName, override }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<{ disabled: boolean; featured: boolean; marginPct: number | null }>({
    disabled: override?.disabled ?? false,
    featured: override?.featured ?? false,
    marginPct: override?.marginPct ?? null,
  });
  const [error, setError] = useState<string | null>(null);

  async function update(patch: Partial<{ disabled: boolean; featured: boolean; displayName: string | null; marginPct: number | null }>) {
    setError(null);
    const optimisticNext = { ...optimistic, ...patch };
    setOptimistic(optimisticNext);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
        setOptimistic({
          disabled: override?.disabled ?? false,
          featured: override?.featured ?? false,
          marginPct: override?.marginPct ?? null,
        });
      }
    });
  }

  async function renameProduct() {
    const next = window.prompt(
      `Renommer ce produit pour les clients (vide = nom Sinalite original) :\n\n"${productName}"`,
      override?.displayName ?? '',
    );
    if (next === null) return; // cancel
    await update({ displayName: next.trim() || null });
  }

  async function setMargin() {
    const current = override?.marginPct;
    const next = window.prompt(
      `Margin % appliquée sur le prix Sinalite (ex: 10 = +10%, -5 = remise 5%, vide = aucune marge).\n\nProduit : "${productName}"`,
      current === null || current === undefined ? '' : String(current),
    );
    if (next === null) return; // cancel
    const trimmed = next.trim();
    if (trimmed === '') {
      await update({ marginPct: null });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < -50 || parsed > 500) {
      setError('Marge doit être un entier entre -50 et 500');
      return;
    }
    await update({ marginPct: parsed });
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        type="button"
        disabled={busy}
        onClick={() => update({ disabled: !optimistic.disabled })}
        title={optimistic.disabled ? 'Réactiver pour les clients' : 'Cacher du catalogue customer'}
        style={{
          padding: '4px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          fontWeight: 600,
          border: '1px solid',
          borderColor: optimistic.disabled ? 'var(--danger)' : 'var(--border-default)',
          background: optimistic.disabled ? 'var(--danger-soft)' : 'transparent',
          color: optimistic.disabled ? 'var(--danger)' : 'var(--text-secondary)',
          borderRadius: 'var(--r-sm)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {optimistic.disabled ? '🚫 HIDDEN' : 'Cacher'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => update({ featured: !optimistic.featured })}
        title={optimistic.featured ? 'Retirer le badge Bestseller' : 'Marquer comme Bestseller'}
        style={{
          padding: '4px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          fontWeight: 600,
          border: '1px solid',
          borderColor: optimistic.featured ? 'var(--accent-primary)' : 'var(--border-default)',
          background: optimistic.featured ? 'var(--accent-soft)' : 'transparent',
          color: optimistic.featured ? 'var(--accent-primary)' : 'var(--text-secondary)',
          borderRadius: 'var(--r-sm)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {optimistic.featured ? '★ FEATURED' : 'Featured'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={renameProduct}
        title="Renommer pour les clients (override Sinalite)"
        style={{
          padding: '4px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          fontWeight: 600,
          border: '1px solid var(--border-default)',
          background: override?.displayName ? 'var(--info-soft)' : 'transparent',
          color: override?.displayName ? 'var(--info)' : 'var(--text-secondary)',
          borderRadius: 'var(--r-sm)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {override?.displayName ? '✎ Renommé' : 'Renommer'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={setMargin}
        title="Définir une marge % appliquée au prix Sinalite pour ce produit"
        style={{
          padding: '4px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          fontWeight: 600,
          border: '1px solid',
          borderColor: optimistic.marginPct !== null ? 'var(--success, #16a34a)' : 'var(--border-default)',
          background: optimistic.marginPct !== null ? 'var(--success-soft, #f0fdf4)' : 'transparent',
          color: optimistic.marginPct !== null ? 'var(--success, #16a34a)' : 'var(--text-secondary)',
          borderRadius: 'var(--r-sm)',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.5 : 1,
        }}
      >
        {optimistic.marginPct !== null
          ? `${optimistic.marginPct > 0 ? '+' : ''}${optimistic.marginPct}%`
          : 'Marge'}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: 'var(--danger)' }} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
