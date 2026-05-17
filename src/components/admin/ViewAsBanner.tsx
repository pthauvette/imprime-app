/**
 * Banner sticky en haut de page quand un admin regarde les données comme
 * un autre user via `?viewAsUserId=...`. Visible 100% du temps pour que
 * l'admin n'oublie pas qu'il est en mode "view as".
 *
 * Affiche : email du target + lien "Revenir à mes commandes" qui pointe
 * vers la même page sans le param. C'est un Server Component — pas besoin
 * de state client.
 */

import Link from 'next/link';
import type { Route } from 'next';

export default function ViewAsBanner({
  targetUser,
  exitHref,
}: {
  targetUser: { email: string; name: string | null; firstName: string | null };
  /** URL vers laquelle "Revenir" (typiquement la même page sans viewAsUserId). */
  exitHref: string;
}) {
  const display = targetUser.firstName ?? targetUser.name ?? targetUser.email;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--warning, #D97706)',
        color: 'white',
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        fontSize: 13,
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 16 }}>👁</span>
        <span>
          Mode admin — tu regardes les commandes de <strong>{display}</strong>{' '}
          (<code style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, opacity: 0.85 }}>{targetUser.email}</code>)
        </span>
      </span>
      <Link
        href={exitHref as Route}
        style={{
          background: 'rgba(255, 255, 255, 0.15)',
          padding: '4px 12px',
          borderRadius: 'var(--r-sm, 4px)',
          color: 'white',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}
      >
        Revenir à mes commandes →
      </Link>
    </div>
  );
}
