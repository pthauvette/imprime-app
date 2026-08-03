'use client';

import { useState, useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useSessionUser } from '@/hooks/useSessionUser';
import {
  mettreEnAttente,
  lireEnAttente,
  viderEnAttente,
  urlDeRetour,
} from '@/lib/wizard/pending-save';

/**
 * Bouton « ★ Sauvegarder » inline — POST /api/saved-configs avec un nom suggéré
 * par défaut (le summary). Feedback optimiste : « ✓ Sauvegardé » 2,5 s.
 *
 * Extrait de QuantityClient lors de la fusion qty↔configuration (la sauvegarde
 * de config se fait désormais depuis l'étape Configuration).
 *
 * ⚠️ PARCOURS « pas encore connecté » (corrigé 2026-08). Avant : 401 → redirection
 * vers `/sign-in`, et **tout était perdu** — la configuration, le nom tapé, et
 * jusqu'à la sélection elle-même, puisque le `callbackUrl` ne portait que
 * `?productId=`. Le client revenait sur les options par défaut, sans le moindre
 * message. Maintenant : l'intention est mise en attente (cf. pending-save.ts),
 * l'URL de retour transporte les options, et la sauvegarde se rejoue seule au
 * retour.
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
  const { connecte } = useSessionUser();
  /** Le rejeu ne doit partir qu'UNE fois : `connecte` passe de null à true,
   *  et un StrictMode de dev remonte les effets. */
  const rejeuFait = useRef(false);

  /** POST la configuration. `siAnonyme` décide de ce qu'on fait d'un 401 :
   *  rediriger (clic volontaire) ou abandonner en silence (rejeu automatique —
   *  rediriger ici rebouclerait connexion → rejeu → connexion). */
  async function envoyer(
    charge: { name: string; productId: number; productName: string; optionIds: number[]; summary: string },
    siAnonyme: 'rediriger' | 'abandonner',
  ) {
    setState('saving');
    try {
      const res = await fetch('/api/saved-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(charge),
      });
      if (res.status === 401) {
        if (siAnonyme === 'abandonner') { setState('idle'); return; }
        mettreEnAttente(charge, Date.now());
        window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(
          urlDeRetour(window.location.pathname, window.location.search, charge.productId, charge.optionIds),
        )}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      viderEnAttente();
      setState(data.duplicate ? 'duplicate' : 'saved');
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setState('idle');
    }
  }

  // Rejeu au retour de la connexion. On attend de SAVOIR que la session existe
  // (`connecte === true`) plutôt que de tenter un POST à l'aveugle : ça évite
  // un aller-retour inutile pour un visiteur anonyme, et surtout toute
  // possibilité de boucle.
  useEffect(() => {
    if (connecte !== true || rejeuFait.current) return;
    const enAttente = lireEnAttente(productId, Date.now());
    if (!enAttente) return;
    rejeuFait.current = true;
    viderEnAttente(); // vidé AVANT l'envoi : un échec ne doit pas se rejouer en boucle
    void envoyer(
      {
        name: enAttente.name,
        productId: enAttente.productId,
        productName: enAttente.productName,
        optionIds: enAttente.optionIds,
        summary: enAttente.summary,
      },
      'abandonner',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecte, productId]);

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
    await envoyer({ name, productId, productName, optionIds, summary }, 'rediriger');
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
