'use client';

/**
 * EmailPreviewForm — Client Component qui owns :
 *   - L'édition des vars en JSON (textarea)
 *   - Submit du form GET (reload de la page avec ?vars=...)
 *   - Bouton "Envoyer test à moi" qui POST /api/admin/email-preview/send
 */

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

interface Props {
  template: string;
  initialVars: Record<string, string | number>;
  varsError: string | null;
  subject: string;
}

export default function EmailPreviewForm({ template, initialVars, varsError, subject }: Props) {
  const router = useRouter();
  const [varsJson, setVarsJson] = useState(() => JSON.stringify(initialVars, null, 2));
  const [pending, startTransition] = useTransition();
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  function onReload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Validate JSON avant de submit pour éviter une page error
    try {
      JSON.parse(varsJson);
    } catch (err) {
      setSendStatus('error');
      setSendMessage('JSON invalide : ' + (err instanceof Error ? err.message : 'parse error'));
      return;
    }
    setSendStatus('idle');
    setSendMessage(null);
    startTransition(() => {
      const params = new URLSearchParams({ template, vars: varsJson });
      router.push(`/admin/email-preview?${params.toString()}` as Route);
    });
  }

  async function onSendTest() {
    setSendStatus('sending');
    setSendMessage(null);
    try {
      const res = await fetch('/api/admin/email-preview/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template,
          vars: JSON.parse(varsJson),
          subject,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; sent?: boolean; to?: string; error?: string };
      if (!res.ok || !data.ok) {
        setSendStatus('error');
        setSendMessage(data.error ?? 'Erreur inconnue');
        return;
      }
      setSendStatus('success');
      setSendMessage(`Email envoyé à ${data.to ?? 'ton adresse'}`);
    } catch (err) {
      setSendStatus('error');
      setSendMessage(err instanceof Error ? err.message : 'Erreur réseau');
    }
  }

  return (
    <form onSubmit={onReload} style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            fontWeight: 600,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>Vars (JSON)</span>
          {varsError && (
            <span style={{ color: 'var(--danger, #dc2626)', textTransform: 'none' }}>
              ⚠ {varsError} — sample vars utilisées
            </span>
          )}
        </span>
        <textarea
          value={varsJson}
          onChange={(e) => setVarsJson(e.target.value)}
          rows={18}
          spellCheck={false}
          style={{
            padding: '10px 12px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-surface)',
            resize: 'vertical',
            lineHeight: 1.4,
          }}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending}
          style={{ flex: 1 }}
        >
          {pending ? '⏳ Rendu…' : '↻ Aperçu'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onSendTest}
          disabled={sendStatus === 'sending'}
          style={{ flex: 1 }}
          title="Envoie le rendu à ton email admin pour valider sur Gmail/Outlook/iOS"
        >
          {sendStatus === 'sending' ? '⏳ Envoi…' : '✉ Test à moi'}
        </button>
      </div>
      {sendMessage && (
        <div
          style={{
            padding: '10px 14px',
            background:
              sendStatus === 'success'
                ? 'var(--success-soft, #f0fdf4)'
                : 'var(--danger-soft, #fef2f2)',
            border: `1px solid ${
              sendStatus === 'success' ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'
            }`,
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            color:
              sendStatus === 'success' ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)',
            lineHeight: 1.4,
          }}
        >
          {sendStatus === 'success' ? '✓ ' : '⚠ '}
          {sendMessage}
        </div>
      )}
    </form>
  );
}
