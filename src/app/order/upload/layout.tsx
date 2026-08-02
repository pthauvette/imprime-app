/**
 * Layout de /order/upload — porte UNIQUEMENT le titre d'onglet.
 *
 * finding audit UI/UX 2026-08 : cette étape (et review/shipping) affichait
 * « Plio — Imprime ce que tu veux, en 2 minutes » — le titre de l'ACCUEIL —
 * dans l'onglet et l'historique du navigateur. Cause : `page.tsx` est un
 * Client Component, or Next.js interdit `export const metadata` depuis un
 * composant client ; le titre retombait donc silencieusement sur celui du
 * layout racine. Les étapes 02/03 (Server Components) avaient bien le leur,
 * d'où l'incohérence au milieu du même wizard.
 *
 * Le layout, lui, reste serveur — c'est l'endroit prévu pour ça.
 */

export const metadata = { title: 'Téléverse ton design' };

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
