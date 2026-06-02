/**
 * HeaderUserSlot — pastille user pour les headers (wizard, marketing, admin).
 *
 * Round 46 (SÉCURITÉ) : ne résout PLUS la session côté serveur. Avant, ce
 * composant faisait `await auth()` et rendait l'email/avatar DANS le HTML SSR.
 * Quand le runtime SSR Amplify resservait par intermittence un rendu connecté
 * à une requête anonyme, ça fuitait la PII + cassait l'hydratation de toute la
 * pastille (cf. incident + PR #197 sur la landing). Tous les consommateurs
 * (pages order/*) sont corrigés d'un coup en faisant déléguer ce composant à
 * ClientHeaderUserSlot, qui résout la session CÔTÉ CLIENT (fetch
 * /api/auth/session avec le cookie du VRAI visiteur) après un placeholder
 * neutre en SSR → zéro PII dans le HTML rendu côté serveur.
 *
 * Reste un Server Component (importable dans des pages server) mais ne fait
 * plus aucun accès server-only ; il ne fait que rendre le slot client.
 */

import ClientHeaderUserSlot from './ClientHeaderUserSlot';

interface HeaderUserSlotProps {
  /** href de la page sign-in à utiliser si user pas connecté. Default `/sign-in`. */
  signInHref?: string;
  /** Label du lien sign-in si user pas connecté. Default `Se connecter`. */
  signInLabel?: string;
  /** Si true, n'affiche rien quand pas connecté (style wizard). Default false. */
  hideWhenAnonymous?: boolean;
}

export default function HeaderUserSlot(props: HeaderUserSlotProps) {
  return <ClientHeaderUserSlot {...props} />;
}
