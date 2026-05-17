/**
 * /wallet — Portefeuille (placeholder MVP).
 *
 * Aucune table Wallet/Balance/Transaction n'existe encore en DB. Pour MVP on
 * affiche un état vide explicatif. Le feature (crédits prépayés + cashback
 * parrainage) arrivera post-MVP — probablement via Stripe Customer balance
 * pour éviter de gérer notre propre ledger.
 *
 * On garde quand même l'auth gate pour rester cohérent avec les autres pages
 * du compte.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { auth } from '@/auth';

export const metadata = { title: 'Portefeuille — Plio' };

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/wallet' as Route);

  return (
    <div className="acct-shell">
      <Sidebar active="/wallet" />

      <main className="acct-main">
        <h1 className="page-title">Portefeuille</h1>
        <p className="page-subtitle">
          Crédits prépayés et cashback parrainage — bientôt disponible.
        </p>

        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            gap: 16,
            padding: '96px 24px',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-default)',
            borderRadius: 'var(--r-xl)',
            textAlign: 'center',
            maxWidth: 560,
            margin: '0 auto',
          }}
        >
          <div style={{ fontSize: 48 }}>👛</div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              letterSpacing: '-0.01em',
              fontWeight: 400,
              margin: 0,
            }}
          >
            Pas de portefeuille pour le moment.
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-muted)',
              margin: 0,
              maxWidth: 460,
              lineHeight: 1.5,
            }}
          >
            Le portefeuille (crédits prépayés + cashback parrainage) arrive bientôt. En
            attendant, paie commande par commande via carte de crédit — c'est rapide et
            sécurisé via Stripe.
          </p>
          <Link
            href={'/orders' as Route}
            className="btn btn-primary"
            style={{ marginTop: 8 }}
          >
            Voir mes commandes →
          </Link>
        </div>
      </main>
    </div>
  );
}
