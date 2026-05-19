/**
 * HeaderUserSlot — Server Component qui résoud la session et rend le
 * UserMenu si l'user est connecté, ou un lien "Se connecter" sinon.
 *
 * Drop-in dans n'importe quel header (wizard, marketing, admin) sans
 * avoir à plumb session manuellement.
 */

import 'server-only';
import { auth } from '@/auth';
import UserMenu from './UserMenu';

interface HeaderUserSlotProps {
  /** href de la page sign-in à utiliser si user pas connecté. Default `/sign-in`. */
  signInHref?: string;
  /** Label du lien sign-in si user pas connecté. Default `Se connecter`. */
  signInLabel?: string;
  /** Si true, n'affiche rien quand pas connecté (style wizard). Default false. */
  hideWhenAnonymous?: boolean;
}

export default async function HeaderUserSlot({
  signInHref = '/sign-in',
  signInLabel = 'Se connecter',
  hideWhenAnonymous = false,
}: HeaderUserSlotProps) {
  const session = await auth();
  const user = session?.user;

  if (!user) {
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
        email: user.email ?? '',
        image: user.image ?? null,
      }}
    />
  );
}
