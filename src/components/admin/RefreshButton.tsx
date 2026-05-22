'use client';

/**
 * RefreshButton — bouton refresh dans le topbar admin.
 *
 * Round 24 #3. Server Components ne re-run pas tant que tu navigues pas.
 * Sur /admin (dashboard), tu vois les KPIs au load. Si une order tombe
 * pendant que tu regardes, elle apparaît pas. Au lieu de F5 (full reload,
 * scroll perdu), router.refresh() re-run uniquement les Server Components
 * de la route courante.
 *
 * Spinner state pour feedback visuel (sinon click silencieux, l'admin
 * pense que ça marche pas).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function RefreshButton({ label = 'Refresh' }: { label?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const handleClick = () => {
    startTransition(() => {
      router.refresh();
      // Note: router.refresh() ne return pas une Promise, le re-render se
      // produit "fire-and-forget". useTransition track le re-render donc
      // isPending devient false quand les Server Components ont fini.
      setLastRefresh(new Date());
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      title={lastRefresh ? `Dernier refresh : ${lastRefresh.toLocaleTimeString('fr-CA')}` : 'Refresh les KPIs (sans rechargement complet)'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: isPending ? 'var(--bg-sunken)' : 'var(--bg-surface)',
        color: isPending ? 'var(--text-muted)' : 'var(--text-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--r-pill)',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        cursor: isPending ? 'wait' : 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 12,
          height: 12,
          animation: isPending ? 'plio-spin 0.8s linear infinite' : 'none',
          fontSize: 11,
          lineHeight: '12px',
          textAlign: 'center',
        }}
        aria-hidden
      >
        ↻
      </span>
      {isPending ? 'Refresh…' : label}
      <style>{`@keyframes plio-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
