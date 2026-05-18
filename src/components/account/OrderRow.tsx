import Link from 'next/link';
import type { Route } from 'next';
import { formatCurrency, formatDate } from '@/lib/format';
import type { OrderStatus } from '@/lib/db/orders';

/**
 * Order row card. Consomme directement notre shape DB Prisma (status enum
 * étendu : PENDING/PAID/SUBMITTED/.../FAILED), pas le shape Sinalite.
 */

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: 'En attente', className: 'status-new' },
  PAID: { label: 'Payée', className: 'status-new' },
  SUBMITTED: { label: 'Soumise', className: 'status-new' },
  IN_PRODUCTION: { label: 'En production', className: 'status-production' },
  SHIPPED: { label: 'Expédiée ↗', className: 'status-shipped' },
  DELIVERED: { label: 'Livrée', className: 'status-delivered' },
  CANCELLED: { label: 'Annulée', className: 'status-cancelled' },
  FAILED: { label: 'Échec', className: 'status-cancelled' },
};

export type OrderRowProps = {
  id: string;
  /** External display id — Sinalite si dispo, sinon notre cuid. */
  displayId: string;
  status: OrderStatus;
  createdAt: Date | string;
  amountCents: number;
  shippingMethod: string;
  taxCents: number;
  shipName: string;
  shipCity: string;
  shipProvince: string;
  /** Snapshot itemized — si présent, on affiche le nom des items au lieu
   *  d'un "Commande X" générique. (Phase 2 multi-item.) */
  itemSummaries?: string[];
};

export default function OrderRow({ order }: { order: OrderRowProps }) {
  const status = STATUS_CONFIG[order.status];
  const isLive =
    order.status === 'PAID' ||
    order.status === 'SUBMITTED' ||
    order.status === 'IN_PRODUCTION';
  const created =
    typeof order.createdAt === 'string'
      ? order.createdAt
      : order.createdAt.toISOString();

  return (
    <Link
      href={`/orders/${order.id}` as Route}
      className={`order-row ${isLive ? 'live' : ''}`}
    >
      <div className="order-thumb">
        <div className="order-thumb-card"></div>
      </div>
      <div className="order-id-block">
        <div className="order-id">{order.displayId}</div>
        <div className="order-date">{formatDate(created)}</div>
      </div>
      <div className="order-info">
        <div className="order-name">
          {order.itemSummaries && order.itemSummaries.length > 0
            ? order.itemSummaries.length === 1
              ? order.itemSummaries[0]
              : `${order.itemSummaries[0]} + ${order.itemSummaries.length - 1} autre${order.itemSummaries.length > 2 ? 's' : ''}`
            : `Commande ${order.displayId}`}
        </div>
        <div className="order-meta">
          {order.shippingMethod}
          {order.taxCents > 0 && (
            <>
              {' · '}taxes {formatCurrency(order.taxCents / 100)}
            </>
          )}
        </div>
        <div className="order-recipient">
          → {order.shipName} · {order.shipCity} {order.shipProvince}
        </div>
      </div>
      <span className={`order-status ${status.className}`}>{status.label}</span>
      <div className="order-total">{formatCurrency(order.amountCents / 100)}</div>
      <div className="order-arrow">
        <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </div>
    </Link>
  );
}
