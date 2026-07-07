/**
 * /admin/samples — gestion des demandes d'échantillons.
 *
 * Liste filtrée par status (PENDING par défaut), chaque row montre :
 *  - Email + nom + adresse complète
 *  - Liste des samples demandés
 *  - Message customer (si fourni)
 *  - Actions : Mark shipped (avec tracking optional) / Cancel
 *
 * Pas de pagination pour MVP — limit 100, l'admin filter par status.
 */

import { requireAdminPage } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminPagination from '@/components/admin/AdminPagination';
import { formatDateTime } from '@/lib/format';
import SampleActions from './SampleActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Demandes d\'échantillons' };

const STATUS_TABS = [
  { key: 'PENDING', label: 'En attente', urgent: true },
  { key: 'SHIPPED', label: 'Expédiées' },
  { key: 'CANCELLED', label: 'Annulées' },
];

const PER_PAGE = 25;

export default async function AdminSamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const filter = STATUS_TABS.some((t) => t.key === sp.status) ? sp.status! : 'PENDING';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const [requests, totalForFilter, counts, ordersCount, usersCount] = await Promise.all([
    prisma.sampleRequest.findMany({
      where: { status: filter },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      // Round 44 #3 (corrigé) — select explicite des 16 champs réellement
      // lus par la liste. SampleRequest a 18 colonnes ; on exclut juste
      // requestIp + requestUa (jamais affichés). Gain modeste mais réel,
      // et noms de colonnes alignés sur le schéma (selectedSamples,
      // shipPostalCode, message, shippedAt) — la 1re version utilisait des
      // noms inexistants (company/samplesJson/shipPostal) qui cassaient le build.
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        selectedSamples: true,
        shipLine1: true,
        shipLine2: true,
        shipCity: true,
        shipProvince: true,
        shipPostalCode: true,
        message: true,
        status: true,
        trackingNumber: true,
        createdAt: true,
        adminNotes: true,
        shippedAt: true,
      },
    }),
    prisma.sampleRequest.count({ where: { status: filter } }),
    prisma.sampleRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.order.count(),
    prisma.user.count(),
  ]);

  const countByStatus = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const pendingCount = countByStatus('PENDING');

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="samples"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Demandes d&apos;échantillons</h1>
            <p className="adm-page-subtitle">
              <strong style={{ color: pendingCount > 0 ? 'var(--warning, #D97706)' : undefined }}>
                {pendingCount} en attente
              </strong>
              {' · '}
              {countByStatus('SHIPPED')} expédiées · {countByStatus('CANCELLED')} annulées
            </p>
          </div>
        </header>

        {/* Tabs filtres */}
        <section style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
          {STATUS_TABS.map((tab) => {
            const active = filter === tab.key;
            const count = countByStatus(tab.key);
            return (
              <a
                key={tab.key}
                href={`/admin/samples?status=${tab.key}`}
                style={{
                  padding: '8px 14px',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  border: '1px solid',
                  borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
                  borderRadius: 'var(--r-sm)',
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                {tab.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: tab.urgent && count > 0 ? 'var(--warning, #D97706)' : 'inherit' }}>
                  {count}
                </span>
              </a>
            );
          })}
        </section>

        {requests.length === 0 ? (
          <div className="adm-panel" style={{ padding: '48px 22px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucune demande pour ce filtre.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {requests.map((r) => {
              let samples: string[] = [];
              try {
                samples = JSON.parse(r.selectedSamples) as string[];
              } catch {
                samples = [r.selectedSamples];
              }
              return (
                <div key={r.id} className="adm-panel" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{r.name}</strong>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                        {r.email}
                      </span>
                      {r.phone && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                          · {r.phone}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatDateTime(r.createdAt.toISOString())}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {samples.map((s, i) => (
                      <span
                        key={i}
                        style={{
                          padding: '4px 10px',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent-primary)',
                          borderRadius: 'var(--r-pill)',
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Livraison :</strong>{' '}
                    {r.shipLine1}{r.shipLine2 ? `, ${r.shipLine2}` : ''}, {r.shipCity}, {r.shipProvince} {r.shipPostalCode}
                  </div>

                  {r.message && (
                    <div style={{ padding: 12, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>
                      « {r.message} »
                    </div>
                  )}

                  {r.trackingNumber && (
                    <div style={{ fontSize: 12, color: 'var(--success)', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>
                      ✓ Tracking : {r.trackingNumber}
                      {r.shippedAt && ` · expédié ${formatDateTime(r.shippedAt.toISOString())}`}
                    </div>
                  )}

                  {r.adminNotes && (
                    <div style={{ padding: 10, background: 'var(--bg-sunken)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                      <strong>Note admin :</strong> {r.adminNotes}
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                    <SampleActions id={r.id} status={r.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <AdminPagination
          page={page}
          total={totalForFilter}
          perPage={PER_PAGE}
          baseHref="/admin/samples"
          extraParams={{ status: filter }}
        />
      </main>
    </div>
  );
}
