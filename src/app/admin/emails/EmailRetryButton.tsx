'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EmailRetryButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleRetry() {
    if (status === 'DEAD' && !confirm('Cette commande est DEAD après 3 retries. Re-tenter ? Tu devrais vérifier que le problème (SES, email invalide, etc.) est réglé avant.')) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/emails/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFeedback(data.sent ? '✓ Envoyé' : '↻ Re-queued');
      router.refresh();
    } catch (err) {
      setFeedback(err instanceof Error ? `✗ ${err.message}` : '✗ Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleRetry}
      disabled={busy}
      style={{
        padding: '4px 10px',
        background: status === 'DEAD' ? 'var(--danger-soft)' : 'var(--accent-soft)',
        color: status === 'DEAD' ? 'var(--danger)' : 'var(--accent-primary)',
        border: '1px solid',
        borderColor: status === 'DEAD' ? 'var(--danger)' : 'var(--accent-primary)',
        borderRadius: 'var(--r-sm)',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? '...' : feedback ?? 'Retry'}
    </button>
  );
}
