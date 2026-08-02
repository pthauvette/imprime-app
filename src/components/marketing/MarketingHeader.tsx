import Link from 'next/link';
import type { Route } from 'next';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';

/**
 * Header partagé pour les pages marketing (about/pricing/contact/quote/
 * reseller/help…). Audit UI/UX 2026-08 — chaque page hand-codait son
 * propre <nav>, et 10 des 11 pages marketing avaient oublié
 * ClientHeaderUserSlot (présent seulement sur l'accueil) : un client
 * connecté perdait tout accès visuel à son compte dès qu'il quittait
 * l'accueil. Un seul composant garantit que ça ne se reproduit pas.
 *
 * `links` reste par-page (chaque page choisit son propre sous-ensemble de
 * liens + son `active`) — volontairement PAS unifié, ce serait une
 * décision d'IA de navigation qui dépasse la correction de ce bug.
 *
 * NON utilisé par : l'accueil (a son propre header i18n/LangSwitch, POC
 * scope-limité, déjà correct) ; /compare (nav minimaliste intentionnelle,
 * page de deep-link SEO — cf. commentaire du fichier) ; /templates (déjà
 * une navigation de type compte, `Sidebar`) ; /samples et /blog (n'avaient
 * AUCUNE nav — décision de contenu à trancher séparément, pas une simple
 * extraction).
 */

export interface MarketingNavLink {
  href: Route;
  label: string;
  active?: boolean;
}

export default function MarketingHeader({
  links,
  cta,
}: {
  links: MarketingNavLink[];
  /** Certaines pages (ex. /quote) n'ont pas de CTA — la page EST déjà l'action. */
  cta?: { href: Route; label: string } | null;
}) {
  return (
    <nav className="mkt-nav">
      <Link href={'/' as Route} className="mkt-brand">Plio.</Link>
      <div className="mkt-nav-links">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`mkt-nav-link${l.active ? ' active' : ''}`}
          >
            {l.label}
          </Link>
        ))}
        {cta && (
          <Link href={cta.href} className="mkt-nav-cta">{cta.label} →</Link>
        )}
        <ClientHeaderUserSlot />
      </div>
    </nav>
  );
}
