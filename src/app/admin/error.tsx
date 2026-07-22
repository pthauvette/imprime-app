'use client';

/**
 * error.tsx — error boundary des pages /admin/* (Round 4 #3).
 *
 * Les pages admin sont `force-dynamic` avec de grosses requêtes Prisma : une
 * exception (DB down, agrégation qui throw, timeout) tombait sur l'écran 500
 * GLOBAL (src/app/error.tsx) — orienté client, avec des liens « Mes commandes /
 * Nouveau devis » hors contexte pour un admin. Cette boundary admin offre à la
 * place un retry + un retour au tableau de bord. Convention Next.js : 'use
 * client' + props { error, reset }.
 */

import { Icon } from '@/components/ui/Icon';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeItems: 'center',
        padding: 48,
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 460, display: 'grid', gap: 16, justifyItems: 'center' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--danger, #dc2626)',
            fontWeight: 600,
          }}
        >
          <Icon name="alert" size={14} /> Erreur 500 · admin
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontSize: 32,
            letterSpacing: '-0.02em',
            fontWeight: 400,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Cette page admin n&apos;a pas pu se charger.
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Souvent une requête qui a expiré ou la DB momentanément indisponible.
          Réessaie — si ça persiste, vérifie l&apos;état des services.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r-pill, 9999px)',
              background: 'var(--accent-primary)',
              color: 'var(--text-on-accent, #fff)',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↻ Réessayer
          </button>
          <a
            href="/admin"
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--r-pill, 9999px)',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Tableau de bord →
          </a>
        </div>
        {error.digest && (
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            ERROR_ID: {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}
