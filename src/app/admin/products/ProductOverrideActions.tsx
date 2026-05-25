'use client';

/**
 * Actions inline pour gérer l'override admin d'un produit Sinalite.
 *
 *  - Toggle "Disabled" : cache le produit du catalogue customer (sans
 *    modifier Sinalite). Useful pour des produits qu'on ne veut pas vendre
 *    via Plio même si Sinalite les active.
 *  - Toggle "Featured" : badge "★" sur la card customer (heuristique nom-based
 *    actuellement, mais override admin prime).
 *  - Edit displayName : ouvre un inline form (Round 41 #1 : était prompt).
 *  - Set margin% : ouvre un inline form (Round 41 #1 : était prompt).
 *
 * Tout passe par PUT /api/admin/products/[id] qui upsert l'override + audit.
 *
 * Round 41 #1 — Pattern openForm aligné avec QuoteActions :
 * un seul état pour les 2 modes ('rename' | 'margin'), une form mutually
 * exclusive (clicking l'un ferme l'autre). Mobile-friendly : pas de
 * window.prompt qui sur iOS tronque le message et empêche multiline.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type FormMode = null | 'rename' | 'margin';

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
  // Round 41 #1 — openForm state pour rename/margin inline (était prompt × 2).
  const [openForm, setOpenForm] = useState<FormMode>(null);
  const [formText, setFormText] = useState('');

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

  function openRenameForm() {
    setOpenForm('rename');
    setFormText(override?.displayName ?? '');
    setError(null);
  }

  function openMarginForm() {
    setOpenForm('margin');
    const current = override?.marginPct;
    setFormText(current === null || current === undefined ? '' : String(current));
    setError(null);
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = formText.trim();

    if (openForm === 'rename') {
      // Vide = clear override → revert au nom Sinalite original. Pas d'erreur.
      setOpenForm(null);
      await update({ displayName: trimmed || null });
      return;
    }

    if (openForm === 'margin') {
      if (trimmed === '') {
        setOpenForm(null);
        await update({ marginPct: null });
        return;
      }
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < -50 || parsed > 500) {
        setError('Marge doit être un entier entre -50 et 500');
        return;
      }
      setOpenForm(null);
      await update({ marginPct: parsed });
    }
  }

  // Metadata par mode (label, placeholder, input type, etc.)
  const formMeta = openForm === 'rename'
    ? {
        label: `Renommer ce produit pour les clients (vide = nom Sinalite original)`,
        sublabel: `Original : "${productName}"`,
        type: 'text' as const,
        placeholder: 'Ex : Cartes de visite premium 14pt UV',
        maxLength: 100,
        submitLabel: 'Renommer',
      }
    : openForm === 'margin'
      ? {
          label: `Margin % appliquée sur le prix Sinalite`,
          sublabel: `Ex: 10 = +10%, -5 = remise 5%, vide = aucune marge`,
          type: 'number' as const,
          placeholder: '0',
          submitLabel: 'Appliquer marge',
        }
      : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
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
          onClick={openRenameForm}
          title="Renommer pour les clients (override Sinalite)"
          style={{
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.04em',
            fontWeight: 600,
            border: '1px solid',
            borderColor: openForm === 'rename' ? 'var(--accent-primary)' : 'var(--border-default)',
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
          onClick={openMarginForm}
          title="Définir une marge % appliquée au prix Sinalite pour ce produit"
          style={{
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.04em',
            fontWeight: 600,
            border: '1px solid',
            borderColor: openForm === 'margin'
              ? 'var(--accent-primary)'
              : optimistic.marginPct !== null
                ? 'var(--success, #16a34a)'
                : 'var(--border-default)',
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

      {/* Round 41 #1 — Inline form (replaces window.prompt × 2). Mutually exclusive
          : openForm est 'rename' ou 'margin' ou null, jamais les deux à la fois. */}
      {openForm && formMeta && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <label htmlFor={`product-override-${productId}-${openForm}`} style={{ fontSize: 12, fontWeight: 600 }}>
            {formMeta.label}
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
              {formMeta.sublabel}
            </span>
          </label>
          <input
            id={`product-override-${productId}-${openForm}`}
            type={formMeta.type}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            placeholder={formMeta.placeholder}
            maxLength={formMeta.type === 'text' ? formMeta.maxLength : undefined}
            min={formMeta.type === 'number' ? -50 : undefined}
            max={formMeta.type === 'number' ? 500 : undefined}
            step={formMeta.type === 'number' ? 1 : undefined}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
            }}
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
              {busy ? '⏳ …' : formMeta.submitLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
