'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

/**
 * Bouton « ★ Sauvegarder » inline — POST /api/saved-configs avec un nom suggéré
 * par défaut (le summary). 401 (pas connecté) → redirige vers sign-in avec
 * callback vers cette page. Feedback optimiste : « ✓ Sauvegardé » 2,5 s.
 *
 * Extrait de QuantityClient lors de la fusion qty↔configuration (la sauvegarde
 * de config se fait désormais depuis l'étape Configuration).
 */
export default function SaveConfigButton({
  productId, productName, optionIds, summary, disabled,
}: {
  productId: number;
  productName: string;
  optionIds: number[];
  summary: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'duplicate'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Round 41 #2 — Inline name form (était window.prompt customer-facing mobile).
  // Sur iPhone le prompt natif tronquait le default name (100 char) à ~25 chars
  // visibles + pas d'autofocus + no styled keyboard. Friction haute pour une
  // action discretionary → conversion vers saved-configs basse.
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

  function openNameForm() {
    if (state !== 'idle' || disabled) return;
    setError(null);
    setNameInput(`${productName} · ${summary}`.slice(0, 100));
    setNaming(true);
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      setError('Nom requis');
      return;
    }
    setNaming(false);
    setState('saving');
    try {
      const res = await fetch('/api/saved-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, productId, productName, optionIds, summary }),
      });
      if (res.status === 401) {
        window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(data.duplicate ? 'duplicate' : 'saved');
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setState('idle');
    }
  }

  const label =
    state === 'saving' ? 'Sauvegarde…' :
    state === 'saved' ? <><Icon name="check" /> Sauvegardé</> :
    state === 'duplicate' ? <><Icon name="check" /> Déjà sauvegardé</> :
    <><Icon name="star" /> Sauvegarder</>;

  if (naming) {
    return (
      <form onSubmit={submitName} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Nom pour cette configuration"
          maxLength={100}
          autoFocus
          required
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            background: 'var(--bg-canvas)',
            color: 'var(--text-primary)',
            minWidth: 200,
          }}
        />
        <button type="submit" className="btn btn-primary btn-sm">
          <Icon name="star" /> Sauver
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(false)}>
          Annuler
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={openNameForm}
        disabled={disabled || state === 'saving'}
        title="Sauve cette configuration pour la retrouver d'un clic plus tard"
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        {label}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>
      )}
    </>
  );
}
