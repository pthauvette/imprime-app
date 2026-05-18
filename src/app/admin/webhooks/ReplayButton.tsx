'use client';

/**
 * Bouton replay pour un WebhookEvent stocké. Disabled si pas de payload
 * (rows pré-migration add_webhook_event_payload).
 *
 * Confirme avant action — replay déclenche des effets externes (re-poste
 * à Sinalite, envoi d'emails). On veut un conscient click.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export default function ReplayButton({
  id, hasPayload, source, eventType, replayCount,
}: {
  id: string;
  hasPayload: boolean;
  source: string;
  eventType: string;
  replayCount: number;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!hasPayload) {
    return (
      <button
        className="adm-wh-action"
        disabled
        title="Payload non stocké (row pré-migration replay). Les nouveaux events sont rejouables."
      >
        ↻
      </button>
    );
  }

  async function replay() {
    if (busy) return;
    const warning = `Re-déclencher ${source} · ${eventType} ?\n\nÇa va re-poster à Sinalite + ré-envoyer les emails associés (confirmation, shipped, etc.). N'utilise que si tu sais pourquoi tu replay (rate limit Sinalite, bug corrigé, etc.).${replayCount > 0 ? `\n\nDéjà rejoué ${replayCount} fois.` : ''}`;
    if (!window.confirm(warning)) return;

    setError(null);
    setOk(false);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/webhooks/${id}/replay`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setOk(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur');
      }
    });
  }

  return (
    <button
      className="adm-wh-action"
      onClick={replay}
      disabled={busy}
      title={
        error
          ? `Erreur : ${error}`
          : ok
            ? 'Replay OK'
            : `Re-jouer le handler${replayCount > 0 ? ` (déjà ${replayCount}x)` : ''}`
      }
      style={{
        color: error ? 'var(--danger)' : ok ? 'var(--success, #16a34a)' : undefined,
        opacity: busy ? 0.5 : 1,
      }}
    >
      {busy ? '…' : ok ? '✓' : '↻'}
      {replayCount > 0 && !busy && !ok && (
        <span style={{ fontSize: 9, marginLeft: 2, opacity: 0.7 }}>{replayCount}</span>
      )}
    </button>
  );
}
