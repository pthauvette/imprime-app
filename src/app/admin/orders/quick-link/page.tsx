/**
 * /admin/orders/quick-link — Outil pour préparer une commande téléphonique.
 *
 * Admin entre productId + options + email client → backend construit le
 * deep-link vers /order/configure?productId=X&options=Y et envoie au client
 * un email avec le lien. Le client clique → wizard pré-rempli → complète
 * upload + shipping + paiement comme normal.
 *
 * MVP : pas de product picker visuel (autocomplete catalog) — admin tape
 * productId + optionIds directement. Suffisant pour les premières
 * commandes téléphoniques où admin sait déjà ce que le client veut.
 * À enrichir avec un picker visuel dans une v2 si le volume grandit.
 */

import { requireAdminPage } from '@/lib/admin-auth';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import QuickLinkForm from './QuickLinkForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Commande téléphonique · Plio' };

export default async function AdminQuickLinkPage() {
  const { session } = await requireAdminPage();
  const [ordersCount, usersCount] = await Promise.all([
    prisma.order.count(),
    prisma.user.count(),
  ]);

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="orders"
        counts={{ orders: ordersCount, users: usersCount }}
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Commande téléphonique</h1>
            <p className="adm-page-subtitle">
              Envoie au client un lien direct vers le wizard avec produit + options pré-sélectionnés.
              Le client complète l'upload + shipping + paiement lui-même.
            </p>
          </div>
        </header>

        <section className="adm-panel" style={{ maxWidth: 720 }}>
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">Préparer le lien</h2>
          </div>
          <div style={{ padding: 22 }}>
            <QuickLinkForm />
          </div>
        </section>

        <section className="adm-panel" style={{ marginTop: 24, maxWidth: 720 }}>
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">Comment ça marche</h2>
          </div>
          <div style={{ padding: 22, fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              <li>Tu trouves le <code>productId</code> et les <code>optionIds</code> dans <a href="/admin/products" style={{ color: 'var(--accent-primary)' }}>Produits Sinalite</a> (clique sur un produit pour voir ses options).</li>
              <li>Tu remplis le formulaire avec l'email du client et la note explicative optionnelle.</li>
              <li>Le client reçoit un email signé par toi (reply-to = ton email).</li>
              <li>Il clique sur le lien → arrive dans le wizard avec produit + options présélectionnés.</li>
              <li>Il complète l'upload + shipping + paiement. Webhook Stripe → Sinalite normalement.</li>
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
