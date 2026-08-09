'use client';

/**
 * Error boundary pour /order/* wizard pages.
 *
 * Round 37 #2. Avant : si Sinalite throw dans /order/configure ou
 * /order/quantity, on faisait `catch { notFound() }` → customer voyait
 * "Page not found" pour un produit qui existe vraiment. Maintenant la
 * route throw → cette boundary catch → message "service indisponible"
 * + bouton retry.
 *
 * Next.js convention : "use client" + componentName 'Error' + reset prop.
 */

import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';

export default function OrderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry/instrumentation aura déjà capturé via Next.js automatic.
    // Pas besoin de re-log ici (sinon double).
  }, [error]);

  return (
    <main
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '96px 24px',
        textAlign: 'center',
        fontFamily: 'var(--font-display)',
      }}
    >
      <Icon name="alert" size={56} style={{ marginBottom: 16 }} />
      <h1 style={{ fontSize: 28, fontWeight: 400, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
        Service temporairement indisponible
      </h1>
      <p
        style={{
          fontSize: 15,
          color: 'var(--text-secondary)',
          margin: '0 0 24px',
          lineHeight: 1.6,
          fontFamily: 'var(--font-body, system-ui)',
        }}
      >
        On a un souci pour récupérer les détails de ce produit chez notre
        imprimeur partenaire. Notre équipe a été notifiée.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '12px 24px',
            background: 'var(--accent-primary)',
            color: 'var(--text-on-accent)',
            border: 'none',
            borderRadius: 'var(--r-pill)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
        <a
          href="/order/start"
          style={{
            padding: '12px 24px',
            background: 'transparent',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-pill)',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          ← Tous les produits
        </a>
      </div>
      {error.digest && (
        <p style={{ marginTop: 32, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          Ref: {error.digest}
        </p>
      )}
    </main>
  );
}
