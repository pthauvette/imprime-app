'use client';

/**
 * Audit mobile 4.1 (complément) — sur mobile la nav de compte (`.acct-nav`) est une
 * bande horizontale scrollable ; le lien actif peut être hors écran à droite (ex.
 * sur /settings, l'avant-dernier lien). Au montage, on centre le lien `.active`
 * dans la bande — en scrollant UNIQUEMENT le conteneur (pas la page, pas le
 * desktop où la nav n'est pas scrollable horizontalement).
 */
import { useEffect } from 'react';

export default function ScrollActiveNavIntoView() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.acct-nav');
    const active = nav?.querySelector<HTMLElement>('.acct-nav-link.active');
    if (!nav || !active) return;
    // Seulement si la bande déborde horizontalement (= mode mobile).
    if (nav.scrollWidth <= nav.clientWidth) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    // Position du lien relative à la zone visible de la bande, centrée.
    const target =
      nav.scrollLeft + (activeRect.left - navRect.left) - (nav.clientWidth - activeRect.width) / 2;
    nav.scrollTo({ left: Math.max(0, target), behavior: 'auto' });
  }, []);

  return null;
}
