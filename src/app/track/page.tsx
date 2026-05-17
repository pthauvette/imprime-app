/**
 * /track — page publique pour suivre une commande sans compte.
 *
 * Use case : customer commande en guest (sans créer de compte). Reçoit
 * l'email de confirmation avec le numéro. Veut voir le status sans
 * cliquer "magic link → vérifier email → cliquer link → revenir". Va
 * sur /track, entre son numéro de commande + email, voit le status
 * read-only.
 *
 * Stratégie sécurité :
 *   - Requiert MATCH email ↔ Order.user.email (case insensitive)
 *   - Si pas de match : "Commande introuvable" générique (pas de leak
 *     d'existence d'un orderId)
 *   - Rate-limited via bucket signin (5 req/15min/IP) pour empêcher
 *     brute-force des combos
 *   - Read-only : aucune action permise depuis /track (cancel, etc.
 *     requièrent toujours auth via /sign-in puis /orders/[id])
 */

import { Suspense } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { prisma } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { headers } from 'next/headers';
import { formatCurrency, formatDate } from '@/lib/format';
import type { OrderStatus } from '@/lib/db/orders';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Suivre ma commande · Plio',
  description: 'Suivez votre commande Plio sans avoir à vous connecter.',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  PAID: 'Payée',
  SUBMITTED: 'Soumise à la presse',
  IN_PRODUCTION: 'En production',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec',
};

const STATUS_HINT: Record<OrderStatus, string> = {
  PENDING: 'On attend la confirmation du paiement.',
  PAID: 'Paiement confirmé. Soumission à la presse imminente.',
  SUBMITTED: 'Commande reçue par notre presse. Préparation en cours.',
  IN_PRODUCTION: 'Production démarrée. Expédition dans 1-3 jours ouvrables.',
  SHIPPED: 'Le colis est en route. Suis le tracking dans ton email.',
  DELIVERED: 'Commande livrée. Merci !',
  CANCELLED: 'Commande annulée. Si tu n\'as pas reçu de remboursement, contacte-nous.',
  FAILED: 'Un problème est survenu. Contacte-nous pour résoudre.',
};

interface SearchParams {
  orderId?: string;
  email?: string;
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const orderId = params.orderId?.trim();
  const email = params.email?.trim().toLowerCase();

  const hasQuery = !!orderId && !!email;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-canvas)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-subtle)' }}>
        <Link href={'/' as Route} style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 400 }}>
          Plio.
        </Link>
      </header>

      <main style={{ flex: 1, padding: '48px 24px', display: 'grid', placeItems: 'start center' }}>
        <div style={{ width: '100%', maxWidth: 560, display: 'grid', gap: 32 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
              Suivi de commande
            </div>
            <h1 style={{ margin: '8px 0 0', fontFamily: 'var(--font-display)', fontSize: 36, letterSpacing: '-0.02em', fontWeight: 400 }}>
              Où en est <em style={{ color: 'var(--accent-primary)' }}>ma commande</em> ?
            </h1>
            <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Entre le numéro de commande (dans ton email de confirmation) + l&apos;email
              utilisé pour commander. Aucun compte requis.
            </p>
          </div>

          {/* Form */}
          <form method="GET" action="/track" style={{ display: 'grid', gap: 14, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 24 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Numéro de commande
              </span>
              <input
                name="orderId"
                defaultValue={orderId ?? ''}
                placeholder="Ex: 48312 ou ABC123"
                required
                autoComplete="off"
                style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 14, fontFamily: 'var(--font-mono)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                Email utilisé pour la commande
              </span>
              <input
                name="email"
                type="email"
                defaultValue={email ?? ''}
                placeholder="ton@email.ca"
                required
                autoComplete="email"
                style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 14 }}
              />
            </label>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }}>
              Suivre ma commande →
            </button>
          </form>

          {/* Result */}
          <Suspense fallback={<div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Recherche…</div>}>
            {hasQuery && <TrackResult orderId={orderId!} email={email!} />}
          </Suspense>

          {!hasQuery && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Tu as un compte Plio ?{' '}
              <Link href={'/sign-in' as Route} style={{ color: 'var(--accent-primary)' }}>Connecte-toi</Link>{' '}
              pour voir toutes tes commandes en un coup d&apos;œil.
            </div>
          )}
        </div>
      </main>

      <footer style={{ padding: '24px 32px', borderTop: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Une question ? <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>{' '}
        ou via le <Link href={'/contact' as Route} style={{ color: 'var(--accent-primary)' }}>formulaire</Link>
      </footer>
    </div>
  );
}

// ─── Server Component : lookup avec rate-limit + security ─────────────────

async function TrackResult({ orderId, email }: { orderId: string; email: string }) {
  // Rate-limit défensif — on prend l'IP via next/headers
  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip') ?? '0.0.0.0';
  const limit = await rateLimit('signin', ip);
  if (!limit.ok) {
    return (
      <ErrorBlock title="Trop de tentatives">
        Réessaye dans quelques minutes ou contacte-nous à{' '}
        <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>.
      </ErrorBlock>
    );
  }

  // Lookup : par sinaliteOrderId (le n° visible dans l'email) OU par cuid suffix
  // Le user tape probablement le n° Sinalite (48312) — qu'on a stocké comme string
  // dans Order.sinaliteOrderId. On accepte aussi le suffix du cuid au cas où.
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { sinaliteOrderId: orderId },
        { id: { endsWith: orderId.toLowerCase() } },
      ],
      user: { email: { equals: email, mode: 'insensitive' } },
    },
    select: {
      id: true,
      sinaliteOrderId: true,
      status: true,
      amountCents: true,
      shippingMethod: true,
      productSummary: true,
      itemsCount: true,
      shipName: true,
      shipCity: true,
      shipProvince: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!order) {
    return (
      <ErrorBlock title="Commande introuvable">
        Vérifie le numéro et l&apos;email. Le numéro figure dans l&apos;email de
        confirmation reçu après ton achat (sujet « C&apos;est imprimé. Confirmation #… »).
      </ErrorBlock>
    );
  }

  const status = order.status as OrderStatus;
  const displayId = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: 24, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
            Commande
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, letterSpacing: '-0.02em' }}>
            #{displayId}
          </div>
        </div>
        <span style={{ padding: '6px 14px', background: statusBg(status), color: statusColor(status), borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' }}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {STATUS_HINT[status]}
      </p>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, display: 'grid', gap: 8, fontSize: 13 }}>
        <Row label="Produit" value={order.productSummary ?? 'Commande Plio'} />
        <Row label="Quantité" value={String(order.itemsCount)} />
        <Row label="Livraison" value={`${order.shippingMethod} · ${order.shipCity}, ${order.shipProvince}`} />
        <Row label="Total payé" value={`${formatCurrency(order.amountCents / 100)} CAD`} />
        <Row label="Date" value={formatDate((order.paidAt ?? order.createdAt).toISOString())} />
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
        Tu veux modifier ou annuler ?{' '}
        <Link href={'/sign-in' as Route} style={{ color: 'var(--accent-primary)' }}>Connecte-toi</Link>{' '}
        avec cet email pour accéder aux actions.
      </div>
    </div>
  );
}

function ErrorBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 24px', background: 'var(--warning-soft, #FFF6E5)', border: '1px solid var(--warning, #D97706)', borderRadius: 'var(--r-md)', display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 600, color: 'var(--warning, #D97706)' }}>⚠ {title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-primary)' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function statusBg(s: OrderStatus): string {
  switch (s) {
    case 'PAID':
    case 'SUBMITTED':
    case 'IN_PRODUCTION':
      return 'var(--accent-soft)';
    case 'SHIPPED':
    case 'DELIVERED':
      return 'var(--success-soft, #f0fdf4)';
    case 'CANCELLED':
    case 'FAILED':
      return 'var(--danger-soft)';
    default:
      return 'var(--bg-sunken)';
  }
}

function statusColor(s: OrderStatus): string {
  switch (s) {
    case 'PAID':
    case 'SUBMITTED':
    case 'IN_PRODUCTION':
      return 'var(--accent-primary)';
    case 'SHIPPED':
    case 'DELIVERED':
      return 'var(--success, #16a34a)';
    case 'CANCELLED':
    case 'FAILED':
      return 'var(--danger)';
    default:
      return 'var(--text-muted)';
  }
}

