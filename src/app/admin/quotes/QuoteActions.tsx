'use client';

/**
 * Actions admin sur une demande de devis sur-mesure.
 * Pattern useTransition pour l'optimistic UX (busy state pendant le PATCH).
 *
 * Round 40 #5 — Remplacement des 3 window.prompt par des inline forms
 * (mobile-unusable : prompt iOS truncated text ~25 chars visible, no
 * multiline, no styled keyboard). Pattern aligné avec OrderActions refund.
 *
 * Trois modes inline : 'quoted' (multiline quote draft), 'reject' (raison
 * courte), 'note' (note interne). État unique `openForm` pour ne pas avoir
 * 3 forms ouverts en parallèle.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';

type FormMode = null | 'quoted' | 'reject' | 'note' | 'create-order';

// finding [129] — devis ACCEPTED → commande payable (production hors
// Sinalite). Form séparé du pattern textarea unique (formText) : plusieurs
// champs structurés (montant + adresse de livraison).
interface CreateOrderFields {
  quotedAmountDollars: string;
  shipName: string;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipProvince: string;
  shipPostalCode: string;
  shipPhone: string;
}

const EMPTY_ORDER_FIELDS: CreateOrderFields = {
  quotedAmountDollars: '', shipName: '', shipLine1: '', shipLine2: '',
  shipCity: '', shipProvince: '', shipPostalCode: '', shipPhone: '',
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13,
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--r-sm)',
};

export default function QuoteActions({
  id, status, orderId, paymentUrl,
}: {
  id: string;
  status: string;
  /** Commande déjà créée depuis ce devis, si applicable. */
  orderId?: string | null;
  /** Lien de paiement retourné par create-order (best-effort, pas re-généré au reload). */
  paymentUrl?: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Round 40 #5 — One state, one form visible at a time.
  const [openForm, setOpenForm] = useState<FormMode>(null);
  const [formText, setFormText] = useState('');
  const [orderFields, setOrderFields] = useState<CreateOrderFields>(EMPTY_ORDER_FIELDS);
  const [createdPaymentUrl, setCreatedPaymentUrl] = useState<string | null>(paymentUrl ?? null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/quotes/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  function openInlineForm(mode: FormMode) {
    setOpenForm(mode);
    setFormText('');
    setOrderFields(EMPTY_ORDER_FIELDS);
    setError(null);
  }

  // finding [129] — form séparé (champs structurés, pas le textarea unique
  // des 3 autres modes).
  async function handleCreateOrderSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(orderFields.quotedAmountDollars);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Montant invalide');
      return;
    }
    if (!orderFields.shipName || !orderFields.shipLine1 || !orderFields.shipCity || !orderFields.shipProvince || !orderFields.shipPostalCode || !orderFields.shipPhone) {
      setError('Tous les champs d\'adresse sont requis');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/quotes/${id}/create-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quotedAmountCents: Math.round(dollars * 100),
            shipName: orderFields.shipName,
            shipLine1: orderFields.shipLine1,
            shipLine2: orderFields.shipLine2 || undefined,
            shipCity: orderFields.shipCity,
            shipProvince: orderFields.shipProvince.toUpperCase(),
            shipPostalCode: orderFields.shipPostalCode,
            shipPhone: orderFields.shipPhone,
          }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setOpenForm(null);
        setCreatedPaymentUrl(j.paymentUrl ?? null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = formText.trim();

    if (openForm === 'quoted') {
      if (!trimmed) {
        setError('Brouillon requis');
        return;
      }
      setOpenForm(null);
      await patch({ action: 'quoted', adminResponse: trimmed });
    } else if (openForm === 'reject') {
      // Raison du refus optionnelle (string vide = pas de note)
      setOpenForm(null);
      await patch({ action: 'reject', adminNotes: trimmed || undefined });
    } else if (openForm === 'note') {
      if (!trimmed) {
        setError('Note requise');
        return;
      }
      setOpenForm(null);
      await patch({ action: 'note', adminNotes: trimmed });
    }
  }

  // Pour différencier les 3 modes UX-wise
  const formMeta = {
    quoted: {
      label: 'Brouillon de quote envoyé (pour archiver le contenu, mailto se fait à part) :',
      rows: 5,
      placeholder: 'Bonjour,\n\nMerci pour ta demande. Voici notre proposition…',
      submitLabel: 'Marquer quoté',
      submitColor: 'var(--accent-primary)',
      required: true,
    },
    reject: {
      label: 'Raison du refus (optionnel) :',
      rows: 2,
      placeholder: 'Quantité trop petite pour notre process — recommandé…',
      submitLabel: 'Confirmer le refus',
      submitColor: 'var(--danger)',
      required: false,
    },
    note: {
      label: 'Note admin (visible uniquement en interne) :',
      rows: 3,
      placeholder: 'Client appelé le 14 — rappelle vendredi PM',
      submitLabel: 'Ajouter la note',
      submitColor: 'var(--accent-primary)',
      required: true,
    },
  } as const;

  // 'create-order' a son propre form (champs structurés, pas de textarea) —
  // exclu de formMeta, rendu séparément ci-dessous via openForm === 'create-order'.
  const meta = openForm && openForm !== 'create-order' ? formMeta[openForm] : null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {status === 'PENDING' && (
          <>
            <button onClick={() => openInlineForm('quoted')} disabled={busy} className="btn btn-primary btn-sm">
              <Icon name="edit" size={14} /> Marquer quoté
            </button>
            <button onClick={() => openInlineForm('reject')} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
              <Icon name="x" size={14} /> Refuser
            </button>
          </>
        )}
        {status === 'QUOTED' && (
          <>
            <button onClick={() => patch({ action: 'accept' })} disabled={busy} className="btn btn-primary btn-sm">
              <Icon name="check" size={14} /> Client a accepté
            </button>
            <button onClick={() => openInlineForm('reject')} disabled={busy} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
              <Icon name="x" size={14} /> Client a refusé
            </button>
          </>
        )}
        {/* finding [129] — devis ACCEPTED sans commande encore créée : lancer
            le paiement (production hors Sinalite, cf. db/orders.ts). */}
        {status === 'ACCEPTED' && !orderId && (
          <button onClick={() => openInlineForm('create-order')} disabled={busy} className="btn btn-primary btn-sm">
            <Icon name="card" size={14} /> Créer la commande
          </button>
        )}
        {(status === 'ACCEPTED' || status === 'REJECTED' || status === 'QUOTED') && (
          <button onClick={() => patch({ action: 'archive' })} disabled={busy} className="btn btn-ghost btn-sm">
            Archiver
          </button>
        )}
        <button onClick={() => openInlineForm('note')} disabled={busy} className="btn btn-ghost btn-sm">
          + Note
        </button>
        {error && <span role="alert" aria-live="assertive" style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
      </div>

      {/* finding [129] — commande créée : lien de paiement à copier/renvoyer
          (déjà envoyé au client par email best-effort côté serveur). */}
      {orderId && (
        <div style={{ padding: 12, background: 'var(--accent-soft)', borderRadius: 'var(--r-md)', fontSize: 12, display: 'grid', gap: 6 }}>
          <div>
            <Icon name="check" size={14} /> Commande créée —{' '}
            <a href={`/admin/orders/${orderId}`} style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
              voir la commande →
            </a>
          </div>
          {createdPaymentUrl && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)' }}>Lien de paiement (déjà envoyé par courriel) :</span>
              <code style={{ fontSize: 11, padding: '2px 6px', background: 'var(--bg-surface)', borderRadius: 'var(--r-sm)', wordBreak: 'break-all' }}>
                {createdPaymentUrl}
              </code>
            </div>
          )}
        </div>
      )}

      {/* finding [129] — form structuré (montant + adresse), séparé du
          textarea générique des 3 autres modes. */}
      {openForm === 'create-order' && (
        <form
          onSubmit={handleCreateOrderSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <label style={{ fontSize: 11, fontWeight: 600 }}>Montant final négocié ($ CAD, taxes incluses) :</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={orderFields.quotedAmountDollars}
            onChange={(e) => setOrderFields({ ...orderFields, quotedAmountDollars: e.target.value })}
            placeholder="1250.00"
            required
            autoFocus
            style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)' }}
          />
          <label style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>Adresse de livraison :</label>
          <input placeholder="Nom complet" required value={orderFields.shipName} onChange={(e) => setOrderFields({ ...orderFields, shipName: e.target.value })} style={inputStyle} />
          <input placeholder="Adresse" required value={orderFields.shipLine1} onChange={(e) => setOrderFields({ ...orderFields, shipLine1: e.target.value })} style={inputStyle} />
          <input placeholder="Suite / app (optionnel)" value={orderFields.shipLine2} onChange={(e) => setOrderFields({ ...orderFields, shipLine2: e.target.value })} style={inputStyle} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            <input placeholder="Ville" required value={orderFields.shipCity} onChange={(e) => setOrderFields({ ...orderFields, shipCity: e.target.value })} style={inputStyle} />
            <input placeholder="Prov (QC)" required maxLength={2} value={orderFields.shipProvince} onChange={(e) => setOrderFields({ ...orderFields, shipProvince: e.target.value })} style={inputStyle} />
            <input placeholder="Code postal" required value={orderFields.shipPostalCode} onChange={(e) => setOrderFields({ ...orderFields, shipPostalCode: e.target.value })} style={inputStyle} />
          </div>
          <input placeholder="Téléphone" required value={orderFields.shipPhone} onChange={(e) => setOrderFields({ ...orderFields, shipPhone: e.target.value })} style={inputStyle} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={() => setOpenForm(null)} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 12, cursor: 'pointer' }}>
              Annuler
            </button>
            <button type="submit" disabled={busy} style={{ padding: '6px 12px', background: 'var(--accent-primary)', color: 'var(--text-on-accent)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {busy ? '⏳ …' : 'Créer la commande + envoyer le lien'}
            </button>
          </div>
        </form>
      )}

      {/* Round 40 #5 — Inline form (replaces window.prompt × 3) */}
      {openForm && meta && (
        <form
          onSubmit={handleFormSubmit}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <label htmlFor={`quote-form-${openForm}`} style={{ fontSize: 11, fontWeight: 600 }}>
            {meta.label}
          </label>
          <textarea
            id={`quote-form-${openForm}`}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            placeholder={meta.placeholder}
            rows={meta.rows}
            required={meta.required}
            maxLength={5000}
            autoFocus
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: 13,
              fontFamily: 'inherit',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--r-sm)',
              resize: 'vertical',
            }}
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
              style={{ padding: '6px 12px', background: meta.submitColor, color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {busy ? '⏳ …' : meta.submitLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
