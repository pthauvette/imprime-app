/**
 * /addresses — Server Component listant le carnet d'adresses du user.
 *
 * Avec CRUD UI via AddressActionsBar (Client Component) qui gère :
 *   - "Ajouter une adresse" → modal AddressForm POST /api/addresses
 *   - "Modifier" sur chaque card → modal AddressForm PATCH /api/addresses/[id]
 *   - "Faire défaut" → PATCH action=set-default (transactionnel)
 *   - "Supprimer" → DELETE avec confirm
 *
 * Les Address rows sont indépendantes des snapshots shipping dans Order
 * (qui restent immutables pour l'historique).
 */

import { redirect } from 'next/navigation';
import type { Route } from 'next';
import Sidebar from '@/components/account/Sidebar';
import { Icon } from '@/components/ui/Icon';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import AddressActionsBar from './AddressActionsBar';

export const metadata = { title: 'Adresses' };

export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const session = await auth();
  if (!session?.user) redirect('/sign-in?callbackUrl=/addresses' as Route);

  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  });

  const shippingCount = addresses.filter((a) => a.kind === 'SHIPPING').length;
  const billingCount = addresses.filter((a) => a.kind === 'BILLING').length;

  // Coerce to a plain serializable shape for the Client Component.
  const plainAddresses = addresses.map((a) => ({
    id: a.id,
    kind: a.kind as 'SHIPPING' | 'BILLING',
    label: a.label,
    isDefault: a.isDefault,
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    province: a.province,
    postalCode: a.postalCode,
    phone: a.phone,
  }));

  return (
    <div className="acct-shell">
      <Sidebar active="/addresses" />

      <main className="acct-main">
        <div className="page-header">
          <div>
            <h1 className="page-title">Mes adresses</h1>
            <p className="page-subtitle">
              {addresses.length === 0 ? (
                <>Aucune adresse sauvegardée pour le moment.</>
              ) : (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {addresses.length} {addresses.length > 1 ? 'adresses' : 'adresse'}
                  </strong>{' '}
                  sauvegardées · {shippingCount} expédition · {billingCount} facturation
                </>
              )}
            </p>
          </div>
        </div>

        {addresses.length === 0 ? (
          <>
            <AddressActionsBar addresses={[]} />
            <EmptyState />
          </>
        ) : (
          <AddressActionsBar addresses={plainAddresses} />
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        gap: 16,
        padding: '64px 24px',
        background: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: 'var(--r-xl)',
        textAlign: 'center',
        maxWidth: 520,
        margin: '24px auto 0',
      }}
    >
      <div><Icon name="send" size={44} /></div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          letterSpacing: '-0.01em',
          fontWeight: 400,
          margin: 0,
        }}
      >
        Pas encore d&apos;adresse enregistrée.
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0, maxWidth: 420 }}>
        Clique sur <strong>+ Ajouter une adresse</strong> ci-dessus pour créer ta
        première adresse. Tu pourras la sélectionner en un clic au checkout.
      </p>
    </div>
  );
}
