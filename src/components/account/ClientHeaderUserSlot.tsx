'use client';

/**
 * ClientHeaderUserSlot — équivalent Client Component de HeaderUserSlot.
 *
 * Fetch /api/auth/session une fois au mount (pas besoin de SessionProvider
 * pour ça — c'est juste un GET). Si user connecté, render UserMenu. Sinon
 * (et si hideWhenAnonymous), render rien.
 *
 * À utiliser dans les pages déjà en 'use client' où on ne peut pas
 * importer HeaderUserSlot (qui est server-only).
 */

import { useEffect, useState } from 'react';
import UserMenu from './UserMenu';

interface SessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SessionResponse {
  user?: SessionUser;
  expires?: string;
}

interface Props {
  signInHref?: string;
  signInLabel?: string;
  hideWhenAnonymous?: boolean;
}

export default function ClientHeaderUserSlot({
  signInHref = '/sign-in',
  signInLabel = 'Se connecter',
  hideWhenAnonymous = false,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<SessionResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        setUser(data?.user ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    // Placeholder de la même taille que l'avatar pour éviter layout shift
    return <div aria-hidden style={{ width: 36, height: 36 }} />;
  }

  if (!user || !user.email) {
    if (hideWhenAnonymous) return null;
    return (
      <a
        href={signInHref}
        style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          textDecoration: 'none',
          fontWeight: 500,
        }}
      >
        {signInLabel}
      </a>
    );
  }

  return (
    <UserMenu
      user={{
        name: user.name ?? null,
        email: user.email,
        image: user.image ?? null,
      }}
    />
  );
}
