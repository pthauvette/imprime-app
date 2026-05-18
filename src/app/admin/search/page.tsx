/**
 * /admin/search — Page recherche transverse admin.
 *
 * Server Component minimal (auth + sidebar), délègue tout au Client
 * SearchUI qui fait du live search via /api/admin/search.
 *
 * Pre-fill via ?q= search param (utile pour les deep-links depuis email
 * ou Slack alert).
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import SearchUI from './SearchUI';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Recherche · Plio' };

export default async function AdminSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  const { q = '' } = await searchParams;

  const [ordersCount, usersCount] = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active={'search' as never}
        counts={{ orders: ordersCount, users: usersCount }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Recherche</h1>
            <p className="adm-page-subtitle">
              Cherche dans commandes, utilisateurs, messages, devis sur-mesure
              et applications reseller.
            </p>
          </div>
        </header>

        <SearchUI initialQuery={q} />
      </main>
    </div>
  );
}
