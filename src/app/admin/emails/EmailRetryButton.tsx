'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { Icon } from '@/components/ui/Icon';

export default function EmailRetryButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<ReactNode>(null);

  async function handleRetry() {
    if (
      status === 'DEAD' &&
      !(await confirm({
        title: 'Re-tenter cet email DEAD ?',
        body: 'Cette commande est DEAD après 3 retries. Vérifie que le problème (SES, email invalide, etc.) est réglé avant de re-tenter.',
        confirmLabel: 'Re-tenter',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/emails/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setFeedback(data.sent ? <><Icon name="check" size={12} /> Envoyé</> : <><Icon name="refresh" size={12} /> Re-queued</>);
      router.refresh();
    } catch (err) {
      setFeedback(err instanceof Error ? <><Icon name="x" size={12} /> {err.message}</> : <><Icon name="x" size={12} /> Erreur</>);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    {dialog}
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
    </>
  );
}
