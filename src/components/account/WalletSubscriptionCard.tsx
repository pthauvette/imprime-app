'use client';

/**
 * WalletSubscriptionCard — affiche le sub auto-renew actif + bouton cancel.
 *
 * Round 22 #3. Style : carte verte légère pour montrer que c'est actif.
 * Cancel via DELETE /api/wallet/subscription.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function WalletSubscriptionCard({ amountCents }: { amountCents: number }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleCancel() {
    if (!window.confirm(`Annuler l'auto-renew mensuel de ${(amountCents / 100).toFixed(2)} $ ?\n\nTu profites du dernier mois déjà payé, puis plus de prélèvements automatiques.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/wallet/subscription', { method: 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <section style={{
      padding: 20,
      background: 'var(--accent-soft)',
      border: '1px solid var(--accent-primary)',
      borderRadius: 'var(--r-xl)',
      marginBottom: 24,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          ♻ Auto-renew actif
        </div>
        <div style={{ fontSize: 15, color: 'var(--text-primary)' }}>
          <strong>{(amountCents / 100).toFixed(2)} $</strong> rechargé automatiquement chaque mois.
        </div>
      </div>
      <button
        type="button"
        onClick={handleCancel}
        disabled={busy}
        style={{
          padding: '8px 14px',
          background: 'transparent',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: 'var(--r-pill)',
          fontSize: 12,
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Annulation…' : 'Annuler'}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: 11, color: 'var(--danger)', width: '100%' }}>
          {error}
        </span>
      )}
    </section>
  );
}
