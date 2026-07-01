'use client';

/**
 * SignOutButton — bouton « Se déconnecter » pour la sidebar de compte (acct-nav).
 *
 * Les pages `.acct-shell` (tableau de bord, commandes, portefeuille, paramètres…)
 * remplacent le header marketing par la sidebar `Sidebar` (acct-nav), qui n'avait
 * AUCUN contrôle de session → une fois dans le compte, l'utilisateur ne pouvait
 * plus se déconnecter (le seul `UserMenu` vit dans le header marketing/wizard,
 * absent de l'acct-shell). Ce bouton rend l'action atteignable partout dans le
 * compte, desktop ET barre horizontale mobile.
 *
 * Client Component : `signOut` de next-auth/react tourne côté navigateur.
 * `void` fire-and-forget est OK CÔTÉ CLIENT (le navigateur ne gèle pas — cf.
 * CLAUDE.md, l'interdiction ne vise que le code serveur/Lambda).
 */

import { signOut } from 'next-auth/react';

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: '/' })}
      // Réutilise .acct-nav-link (padding, radius, cible tactile 44px mobile) et
      // surcharge juste la couleur en danger + reset des styles natifs du bouton.
      className="acct-nav-link acct-nav-signout"
      style={{
        width: '100%',
        textAlign: 'left',
        background: 'transparent',
        border: 'none',
        font: 'inherit',
        cursor: 'pointer',
        color: 'var(--danger, #dc2626)',
      }}
    >
      <span>↩ Se déconnecter</span>
    </button>
  );
}
