import Link from 'next/link';
import type { Route } from 'next';
import CommandPalette from './CommandPalette';

/**
 * Sidebar admin — réutilisée par les 10 pages /admin/*.
 *
 * Les counts sont passés en props (ou fallback hardcodé). Pour la prod,
 * passer les vraies stats via les Server Components.
 */

export type AdminSidebarKey =
  | 'dashboard'
  | 'orders'
  | 'webhooks'
  | 'emails'
  | 'reviews'
  | 'samples'
  | 'reseller-applications'
  | 'messages'
  | 'quotes'
  | 'broadcast'
  | 'email-preview'
  | 'experiments'
  | 'search'
  | 'notifications'
  | 'audit'
  | 'templates'
  | 'products'
  | 'users'
  | 'finances'
  | 'promo-codes'
  | 'settings';

interface NavItem {
  key: AdminSidebarKey;
  href: Route;
  label: string;
  icon: React.ReactNode;
  count?: number | string;
  urgent?: boolean;
}

const ICONS = {
  dashboard: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" />
    </svg>
  ),
  orders: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 4h12v9H2zM2 7h12M5 10h2" />
    </svg>
  ),
  webhooks: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={4} cy={8} r={2} />
      <circle cx={12} cy={4} r={2} />
      <circle cx={12} cy={12} r={2} />
      <path d="M5.8 7.2L10.4 5M5.8 8.8L10.4 11" />
    </svg>
  ),
  templates: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x={2} y={3} width={12} height={10} rx={1} />
      <path d="M2 6h12M5 9h6M5 11h4" />
    </svg>
  ),
  products: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 5l5-3 5 3v6l-5 3-5-3zM3 5l5 3 5-3M8 8v6" />
    </svg>
  ),
  users: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={8} cy={5} r={2.5} />
      <path d="M3 13c0-2.5 2.5-4 5-4s5 1.5 5 4" />
    </svg>
  ),
  finances: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 12V4M5 12V7M8 12V5M11 12V8M14 12V3" />
    </svg>
  ),
  'promo-codes': (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M2 8l6-6h6v6l-6 6z" />
      <circle cx={11} cy={5} r={1} fill="currentColor" />
    </svg>
  ),
  emails: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x={2} y={3} width={12} height={10} rx={1} />
      <path d="M2 5l6 4l6-4" />
    </svg>
  ),
  reviews: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.3l4-.6z" />
    </svg>
  ),
  samples: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x={2} y={4} width={5} height={9} rx={1} />
      <rect x={9} y={2} width={5} height={11} rx={1} />
    </svg>
  ),
  audit: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M3 2h7l3 3v9H3z" />
      <path d="M10 2v3h3M5 8h6M5 10h6M5 12h4" />
    </svg>
  ),
  settings: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={8} cy={8} r={2.5} />
      <path d="M8 2v2M8 12v2M14 8h-2M4 8H2M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4M12.2 12.2l-1.4-1.4M5.2 5.2L3.8 3.8" />
    </svg>
  ),
  search: (
    <svg className="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx={7} cy={7} r={5} />
      <path d="M11 11l3 3" />
    </svg>
  ),
};

export interface AdminSidebarProps {
  active: AdminSidebarKey;
  counts?: Partial<Record<AdminSidebarKey, number | string>>;
  user?: {
    name: string | null;
    email: string;
    role?: 'USER' | 'ADMIN' | string;
  };
  urgents?: Partial<Record<AdminSidebarKey, boolean>>;
}

export default function AdminSidebar({ active, counts = {}, user, urgents = {} }: AdminSidebarProps) {
  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: 'Opérations',
      items: [
        { key: 'dashboard', href: '/admin' as Route, label: 'Tableau de bord', icon: ICONS.dashboard },
        { key: 'search', href: '/admin/search' as Route, label: 'Recherche · ⌘K', icon: ICONS.search },
        { key: 'notifications', href: '/admin/notifications' as Route, label: 'Notifications', icon: ICONS.reviews, urgent: urgents.notifications },
        { key: 'orders', href: '/admin/orders' as Route, label: 'Commandes', icon: ICONS.orders, count: counts.orders },
        { key: 'webhooks', href: '/admin/webhooks' as Route, label: 'Webhooks', icon: ICONS.webhooks, count: counts.webhooks, urgent: urgents.webhooks },
        { key: 'emails', href: '/admin/emails' as Route, label: 'Queue email', icon: ICONS.emails, count: counts.emails, urgent: urgents.emails },
        { key: 'email-preview', href: '/admin/email-preview' as Route, label: 'Aperçu emails', icon: ICONS.emails },
      ],
    },
    {
      label: 'Catalogue',
      items: [
        { key: 'templates', href: '/admin/templates' as Route, label: 'Templates', icon: ICONS.templates, count: counts.templates },
        { key: 'products', href: '/admin/products' as Route, label: 'Produits Sinalite', icon: ICONS.products, count: counts.products },
      ],
    },
    {
      label: 'Audience',
      items: [
        { key: 'users', href: '/admin/users' as Route, label: 'Utilisateurs', icon: ICONS.users, count: counts.users },
        { key: 'reviews', href: '/admin/reviews' as Route, label: 'Reviews', icon: ICONS.reviews, count: counts.reviews, urgent: urgents.reviews },
        { key: 'samples', href: '/admin/samples' as Route, label: 'Échantillons', icon: ICONS.samples, count: counts.samples, urgent: urgents.samples },
        { key: 'reseller-applications', href: '/admin/reseller-applications' as Route, label: 'Demandes reseller', icon: ICONS.users, count: counts['reseller-applications'], urgent: urgents['reseller-applications'] },
        { key: 'messages', href: '/admin/messages' as Route, label: 'Messages clients', icon: ICONS.emails, count: counts.messages, urgent: urgents.messages },
        { key: 'quotes', href: '/admin/quotes' as Route, label: 'Devis sur-mesure', icon: ICONS.emails, count: counts.quotes, urgent: urgents.quotes },
        { key: 'broadcast', href: '/admin/broadcast' as Route, label: 'Broadcasts email', icon: ICONS.emails },
      ],
    },
    {
      label: 'Finance',
      items: [
        { key: 'finances', href: '/admin/finances' as Route, label: 'Finances', icon: ICONS.finances },
        { key: 'promo-codes', href: '/admin/promo-codes' as Route, label: 'Codes promo', icon: ICONS['promo-codes'], count: counts['promo-codes'] },
      ],
    },
    {
      label: 'Système',
      items: [
        { key: 'experiments', href: '/admin/experiments' as Route, label: 'Expériences A/B', icon: ICONS.audit },
        { key: 'audit', href: '/admin/audit' as Route, label: 'Journal admin', icon: ICONS.audit },
        { key: 'settings', href: '/admin' as Route, label: 'Réglages', icon: ICONS.settings },
      ],
    },
  ];

  const initials = userInitials(user);

  return (
    <aside className="adm-nav">
      {/* Command palette dispo partout via Cmd/Ctrl+K — Client Component
          monté ici dans le Server Component sidebar pour pas avoir à modifier
          chaque page admin. */}
      <CommandPalette />

      <div className="adm-nav-brand">
        <span className="adm-nav-brand-mark">Plio.</span>
        <span className="adm-nav-brand-tag">Admin</span>
      </div>

      {sections.map((section) => (
        <div key={section.label}>
          <div className="adm-nav-section">{section.label}</div>
          <ul className="adm-nav-list">
            {section.items.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`adm-nav-link${active === item.key ? ' active' : ''}`}
                >
                  <span className="adm-nav-link-text">
                    {item.icon}
                    {item.label}
                  </span>
                  {item.count !== undefined && (
                    <span className={`adm-nav-count${item.urgent ? ' urgent' : ''}`}>
                      {item.count}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {user && (
        <div className="adm-nav-user">
          <div className="adm-nav-user-avatar">{initials}</div>
          <div className="adm-nav-user-info">
            <div className="adm-nav-user-name">{user.name ?? user.email.split('@')[0]}</div>
            <div className="adm-nav-user-role">{user.role === 'ADMIN' ? 'Owner · ★★★' : 'Admin'}</div>
          </div>
        </div>
      )}
    </aside>
  );
}

function userInitials(user?: { name: string | null; email: string }): string {
  if (!user) return '··';
  if (user.name) {
    return user.name
      .split(' ')
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('') || '··';
  }
  return user.email.slice(0, 2).toUpperCase();
}
