'use client';

/**
 * Bouton « Se déconnecter » de la sidebar admin (audit admin 2026-07 §5.7 —
 * le bloc utilisateur n'était pas interactif : aucun moyen de fermer la
 * session depuis l'admin). Même pattern que account/SignOutButton :
 * `signOut` de next-auth/react tourne côté navigateur, `void` fire-and-forget
 * OK CÔTÉ CLIENT (l'interdiction Lambda ne vise que le code serveur).
 */

import { signOut } from 'next-auth/react';

export default function AdminSignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: '/' })}
      className="adm-nav-link"
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
      <span className="adm-nav-link-text">↩ Se déconnecter</span>
    </button>
  );
}
