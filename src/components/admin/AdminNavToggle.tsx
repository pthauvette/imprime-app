'use client';

/**
 * AdminNavToggle — hamburger + drawer pour la nav admin sous 1024px (Round 4 #5).
 *
 * Sous 1024px, `.adm-nav` est `display:none` (cf. globals.css) et le seul accès
 * restant était Cmd+K (pas de trigger tappable) → admin mobile/tablette ne
 * pouvait plus naviguer. Ce bouton (visible uniquement <1024px via CSS) bascule
 * une classe `adm-nav-open` sur <html> ; le CSS affiche alors `.adm-nav` en
 * drawer fixe qui glisse depuis la gauche, avec un backdrop.
 *
 * Le trigger et la `.adm-nav` vivent dans des composants différents (layout vs
 * AdminSidebar server-rendered) → on passe par une classe sur <html> plutôt
 * qu'un état React partagé. Fermeture sur Escape, clic backdrop, et changement
 * de route (sinon le drawer resterait ouvert après navigation — le layout admin
 * persiste).
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function AdminNavToggle() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Reflète l'état dans une classe sur <html> (le CSS cible html.adm-nav-open .adm-nav)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('adm-nav-open', open);
    return () => root.classList.remove('adm-nav-open');
  }, [open]);

  // Ferme à chaque changement de route (le layout admin persiste sinon le drawer
  // resterait ouvert après avoir cliqué un lien).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape ferme
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="adm-nav-burger"
        aria-label={open ? 'Fermer le menu admin' : 'Ouvrir le menu admin'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <Icon name="x" /> : <Icon name="menu" />}
      </button>
      {open && (
        <div
          className="adm-nav-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
