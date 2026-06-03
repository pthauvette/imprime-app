import type { ReactNode } from 'react';

/**
 * Message d'erreur de formulaire ANNONCÉ aux lecteurs d'écran (Audit v2 #9.2).
 *
 * Avant, les erreurs étaient de simples `<div>` visuels (couleur danger) sans
 * `role`/`aria-live` → un utilisateur de lecteur d'écran restait bloqué sur un
 * submit échoué sans jamais entendre pourquoi. `role="alert"` + `aria-live`
 * forcent l'annonce immédiate du message dès qu'il apparaît.
 *
 * Rend `null` si pas de message (pas de région alert vide qui pollue l'arbre).
 */
export default function FormError({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!children) return null;
  return (
    <p
      role="alert"
      aria-live="assertive"
      className={className}
      style={{ margin: 0, fontSize: 12, color: 'var(--danger)', ...style }}
    >
      ✗ {children}
    </p>
  );
}
