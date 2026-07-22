'use client';

/**
 * Client Component qui POST /api/newsletter/unsubscribe (nouveau endpoint
 * qui demande POST + token vérification) pour confirmer le désabonnement.
 *
 * On utilise le même endpoint que le GET — le route handler détecte la
 * méthode POST et fait l'action sans rendre la page HTML (juste JSON).
 */

import { useState, useTransition } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function UnsubscribeForm({ email, token }: { email: string; token: string }) {
  const [busy, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      try {
        const params = new URLSearchParams({ email, token });
        const res = await fetch(`/api/newsletter/unsubscribe?${params.toString()}`, {
          method: 'POST',
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  if (done) {
    return (
      <div
        role="status"
        style={{
          padding: 20,
          background: '#E5EDE8',
          border: '1px solid #1F3D2B',
          borderRadius: 8,
          marginTop: 16,
        }}
      >
        <div style={{ fontSize: 18, color: '#1F3D2B', fontWeight: 600, marginBottom: 8 }}>
          <Icon name="check" size={14} /> Désabonnement confirmé
        </div>
        <p style={{ fontSize: 14, color: '#4A554D', margin: 0 }}>
          On a marqué <strong>{email}</strong> comme désabonné. Tu peux fermer cette page.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        style={{
          padding: '12px 24px',
          background: busy ? '#7A8780' : '#1F3D2B',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {busy ? 'En cours…' : 'Confirmer le désabonnement'}
      </button>

      {error && (
        <div role="alert" style={{ marginTop: 12, padding: 12, background: '#FDF2F2', color: '#9B2C2C', borderRadius: 4, fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
