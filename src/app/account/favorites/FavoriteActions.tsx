'use client';

/**
 * Actions inline pour une config sauvegardée : Utiliser / Renommer / Supprimer.
 *
 * "Utiliser" : POST /api/saved-configs/[id] qui bump le compteur + retourne
 *  l'URL deep-link vers le wizard. On window.location.href pour navigate
 *  (router.push() ne re-render pas le server component pre-fill aussi
 *  rapidement et on veut un cold start propre du wizard).
 *
 * "Supprimer" : confirm() inline pour MVP. Future : modal Plio styled.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function FavoriteActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function use() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/saved-configs/${id}`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.url) {
          window.location.href = data.url;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  async function rename() {
    const next = window.prompt('Nouveau nom :', name);
    if (!next || next.trim() === name) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/saved-configs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: next.trim() }),
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

  async function remove() {
    if (!window.confirm(`Supprimer "${name}" ?`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/saved-configs/${id}`, { method: 'DELETE' });
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

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={use}
        disabled={busy}
        style={{ opacity: busy ? 0.5 : 1 }}
      >
        Utiliser →
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={rename}
        disabled={busy}
        title="Renommer"
      >
        Renommer
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={remove}
        disabled={busy}
        title="Supprimer"
        style={{ color: 'var(--danger)' }}
      >
        ✕
      </button>
      {error && (
        <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>
      )}
    </div>
  );
}
