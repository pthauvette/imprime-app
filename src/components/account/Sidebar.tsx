import Link from 'next/link';
import type { Route } from 'next';

type Item = {
  href: Route;
  label: string;
  /** Badge optionnel. Round 2 audit — NE PAS hardcoder une valeur : elle
   *  s'afficherait à tous les users (un compte neuf voyait « 12 commandes »).
   *  À remplir avec un vrai compte Prisma par userId si on veut les badges. */
  count?: number;
};

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'Compte',
    items: [
      { href: '/account' as Route, label: '⌂ Tableau de bord' },
      { href: '/orders', label: 'Mes commandes' },
      { href: '/account/favorites' as Route, label: '★ Configurations sauvées' },
      { href: '/drafts' as Route, label: 'Brouillons' },
      { href: '/addresses' as Route, label: 'Adresses' },
      { href: '/wallet' as Route, label: 'Portefeuille' },
      { href: '/payments' as Route, label: 'Paiements' },
      { href: '/account/referrals' as Route, label: '🎁 Parrainage' },
      { href: '/settings' as Route, label: 'Paramètres' },
      { href: '/settings/privacy' as Route, label: '🔒 Confidentialité' },
    ],
  },
  {
    title: 'Outils',
    items: [
      { href: '/order/start' as Route, label: '+ Nouvelle commande' },
      { href: '/samples' as Route, label: 'Demander un échantillon' },
      { href: '/templates' as Route, label: 'Templates & guides' },
      { href: '/reseller' as Route, label: 'Devenir reseller' },
    ],
  },
  {
    title: 'Support',
    items: [
      { href: '/help' as Route, label: 'Aide & FAQ' },
    ],
  },
];

export default function Sidebar({ active }: { active: string }) {
  return (
    <aside className="acct-nav">
      <div className="acct-nav-brand">
        <Link href={'/' as Route} style={{ color: 'inherit' }}>Plio.</Link>
      </div>
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="acct-nav-section">{section.title}</div>
          <ul className="acct-nav-list">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`acct-nav-link ${item.href === active ? 'active' : ''}`}
                >
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span className="count">{item.count}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
