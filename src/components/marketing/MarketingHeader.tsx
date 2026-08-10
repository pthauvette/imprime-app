import Link from 'next/link';
import type { Route } from 'next';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';
import MarketingMobileMenu from './MarketingMobileMenu';

/**
 * Header partagé pour les pages marketing (about/pricing/contact/quote/
 * reseller/help/blog…). Audit UI/UX 2026-08, round 2 — « un menu
 * unique » (Patrick) : avant, chaque page hand-codait son propre <nav>
 * avec un sous-ensemble DIFFÉRENT de liens (about avait "À propos" mais
 * pas "Tarifs" ; pricing avait "Tarifs"+"Aide" mais pas "Contact" ;
 * quote/reseller n'avaient pas de CTA…) — en plus de l'auth slot manquant
 * déjà corrigé au round 1. Un seul menu, une seule fois, réutilisé
 * partout : NAV_ITEMS est la source unique, chaque page indique juste
 * quel item est actif.
 *
 * Reseller reste joignable (footer, /about, /quote) sans occuper un
 * slot du menu principal — 6 liens + CTA + compte est déjà la limite
 * raisonnable avant que la nav devienne illisible.
 *
 * NON utilisé par : l'accueil (a son propre header i18n/LangSwitch, POC
 * scope-limité + nav à ancres #products/#how spécifique à une page
 * longue défilante — déjà correct, contexte différent) ; /compare (nav
 * minimaliste intentionnelle, page de deep-link SEO — cf. commentaire du
 * fichier) ; /templates (déjà une navigation de type compte, `Sidebar`) ;
 * /legal/* (chrome légal minimal `legal-nav` : marque + retour à l'accueil).
 *
 * ⚠️ Le premier passage (2026-08) n'avait migré que les 7 pages marketing
 * évidentes. /track, /search, /mcp et /reseller/guide avaient été RATÉES et
 * gardaient chacune leur propre <nav> — quatre jeux de liens de plus, dont un
 * (/search) sans aucun CTA et tous sans le bloc compte. « Un menu unique »
 * n'était donc pas vrai. Toute nouvelle page publique passe par ici : s'il
 * faut un cas particulier, il s'ajoute à la liste ci-dessus, avec sa raison.
 */

export type MarketingNavKey = 'produits' | 'tarifs' | 'blog' | 'about' | 'aide' | 'contact';

const NAV_ITEMS: { key: MarketingNavKey; href: Route; label: string }[] = [
  { key: 'produits', href: '/order/start' as Route, label: 'Produits' },
  { key: 'tarifs', href: '/pricing' as Route, label: 'Tarifs' },
  { key: 'blog', href: '/blog' as Route, label: 'Blog' },
  { key: 'about', href: '/about' as Route, label: 'À propos' },
  { key: 'aide', href: '/help' as Route, label: 'Aide' },
  { key: 'contact', href: '/contact' as Route, label: 'Contact' },
];

export default function MarketingHeader({ active }: { active?: MarketingNavKey }) {
  return (
    <nav className="mkt-nav">
      <Link href={'/' as Route} className="mkt-brand">Plio.</Link>

      {/* Rendu BUREAU — masqué sous 700px, où le repli prend le relais. */}
      <div className="mkt-nav-links">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`mkt-nav-link${active === item.key ? ' active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
        <Link href={'/order/start' as Route} className="mkt-nav-cta">Commander →</Link>
        <ClientHeaderUserSlot />
      </div>

      {/* Rendu MOBILE. Le CTA reste DEHORS, visible à toutes les largeurs :
          c'est l'action de conversion (cf. MarketingMobileMenu). Les deux
          rendus parcourent le même NAV_ITEMS — pas de seconde liste à tenir. */}
      <div className="mkt-nav-mobile">
        <Link href={'/order/start' as Route} className="mkt-nav-cta">Commander →</Link>
        <MarketingMobileMenu items={NAV_ITEMS} active={active} />
      </div>
    </nav>
  );
}
