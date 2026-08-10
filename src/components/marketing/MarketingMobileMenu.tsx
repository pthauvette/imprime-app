'use client';

/**
 * Menu mobile de la barre marketing — il n'en existait aucun.
 *
 * MESURÉ AVANT (prod, 375×812) : la barre n'avait pas de bascule mobile, donc
 * ses 6 liens + le CTA + le bloc compte PASSAIENT À LA LIGNE. Résultat :
 * **209px, soit 26% de la hauteur de l'écran**, consommés avant le moindre
 * contenu, sur /about, /pricing, /help, /blog, /contact, /quote, /track,
 * /search et le blogue. Aucun instrument existant ne pouvait le voir : il n'y
 * a ni débordement horizontal (la barre passe à la ligne, elle ne dépasse pas)
 * ni défaut de contraste. D'où `scripts/measure-tap-targets.mjs`.
 *
 * ⚠️ LE CTA RESTE HORS DU MENU, À DESSEIN. « Commander → » demeure visible dans
 * la barre à toutes les largeurs : c'est l'action de conversion, la cacher
 * derrière un tap supplémentaire se paie en commandes. Le repli ne prend que la
 * navigation SECONDAIRE — les six sections et le bloc compte.
 *
 * `NAV_ITEMS` n'est pas recopié ici : il vient en props de `MarketingHeader`,
 * qui reste la source unique. Le rendu bureau et le rendu mobile parcourent la
 * même liste — c'est ce qui a manqué aux quatre navs divergentes de #559.
 */

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';
import { Icon } from '@/components/ui/Icon';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';

export interface MobileNavItem {
  key: string;
  href: Route;
  label: string;
}

export default function MarketingMobileMenu({
  items,
  active,
}: {
  items: readonly MobileNavItem[];
  active?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const idPanneau = useId();
  const boutonRef = useRef<HTMLButtonElement>(null);
  const chemin = usePathname();

  // Refermer quand la navigation aboutit. Sans ça, le panneau reste ouvert
  // par-dessus la page qu'on vient de demander — l'utilisateur croit que son
  // tap n'a rien fait et tape une deuxième fois.
  useEffect(() => {
    setOuvert(false);
  }, [chemin]);

  // Échap referme et REND LE FOCUS au bouton : sans ce retour, le focus reste
  // sur un élément qui vient d'être démonté et repart au début du document.
  useEffect(() => {
    if (!ouvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOuvert(false);
      boutonRef.current?.focus();
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [ouvert]);

  return (
    <>
      <button
        ref={boutonRef}
        type="button"
        className="mkt-burger"
        aria-expanded={ouvert}
        aria-controls={idPanneau}
        aria-label={ouvert ? 'Fermer le menu' : 'Ouvrir le menu'}
        onClick={() => setOuvert((v) => !v)}
      >
        <Icon name={ouvert ? 'x' : 'menu'} size={22} />
      </button>

      {/* Rendu inconditionnel, masqué par `hidden` : un panneau monté/démonté
          perdrait l'association aria-controls entre deux états, et certains
          lecteurs d'écran annoncent alors « contrôle une région inexistante ». */}
      <div id={idPanneau} className="mkt-menu-panel" hidden={!ouvert}>
        <nav aria-label="Navigation principale">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`mkt-menu-link${active === item.key ? ' active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mkt-menu-compte">
          <ClientHeaderUserSlot />
        </div>
      </div>
    </>
  );
}
