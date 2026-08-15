/**
 * /admin/finances — Money dashboard. Period-driven via ?period=…
 *
 * Server Component. Calcule en parallèle :
 *   - aggregates de la période (revenue, count, AOV)
 *   - daily breakdown pour le chart
 *   - revenue par province (groupBy)
 *   - top customers (groupBy userId + join User)
 *   - tax breakdown par province
 *   - refunds récents (OrderEvent.kind === 'REFUND_ISSUED')
 *
 * LIMITES DU MODÈLE DB :
 *   1. Audit v2 #10.6 — RÉSOLU : OrderEvent.data pour REFUND_ISSUED contient
 *      désormais amountCents (= refund.amount Stripe), donc les refunds partiels
 *      sont sommés au bon montant (cf. refundAmountCentsOf). Les events
 *      antérieurs au fix retombent sur le total commande (fallback).
 *   2. Order.taxCents est le total taxes — pas de décomposition TPS/TVQ/HST.
 *      Le tableau "taxes par province" affiche donc juste le total collecté
 *      par province, sans split.
 *   3. Stripe payouts pas stockés en DB — on affiche un empty state + lien.
 */

import Link from 'next/link';
import type { Route } from 'next';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { prisma } from '@/lib/db';
import { requireAdminPage } from '@/lib/admin-auth';
import { getAdminSidebarCounts } from '@/lib/admin/sidebar-counts';
import { formatCurrency, formatDate } from '@/lib/format';
import { refundAmountCentsOf, sommeRemboursementsValidesCents } from '@/lib/finances/refund-amount';
import { calculerNonReconcilie, STATUTS_VOIDES } from '@/lib/finances/encaisse-non-reconcilie';

/**
 * Plafond de commandes voidées examinées. Il est VISIBLE à l'écran quand il
 * mord : un total tronqué présenté comme complet est pire qu'un total absent.
 */
const PLAFOND_RECONCILIATION = 500;
import { referencePlio } from '@/lib/sinalite/order-notes';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: 'Admin — Finances' };
export const dynamic = 'force-dynamic';

type Period = 'today' | '7d' | '30d' | 'mtd' | 'ytd';
const PERIODS: readonly Period[] = ['today', '7d', '30d', 'mtd', 'ytd'] as const;
const PERIOD_LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  '7d': '7 j',
  '30d': '30 j',
  mtd: 'MTD',
  ytd: 'YTD',
};

interface SP {
  period?: string;
}

export default async function AdminFinancesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { session } = await requireAdminPage();
  const sp = await searchParams;
  const period: Period = (PERIODS as readonly string[]).includes(sp.period ?? '')
    ? (sp.period as Period)
    : '30d';

  const now = new Date();
  const { start: periodStart, end: periodEnd, label: periodLabel } = computeRange(period, now);
  const periodLengthMs = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - periodLengthMs);
  const prevEnd = new Date(periodStart.getTime());

  // ─── Parallel queries ──────────────────────────────────────────────────
  const [
    revenueAgg,
    revenuePrevAgg,
    countByProvince,
    topCustomers,
    paidOrdersInPeriod,
    refundsInPeriod,
    refundsPrevPeriod,
    recentRefundEvents,
    sidebarOrders,
    sidebarUsers,
    sidebarWebhooks,
    revenueByUserId,
    voideesSansRemboursement,
    voideesAvecRemboursement,
    totalCandidats,
  ] = await Promise.all([
    // Round 16 #3 : .catch fallbacks pour éviter 500 dashboard si table manque.
    // Aggregates throwers → fallback à un shape minimal vide.
    prisma.order.aggregate({
      // Audit admin 2026-07 §3.3 — exclure CANCELLED/FAILED (ventes voidées) du
      // brut, comme le fait déjà revenueByUserId. Le refund est soustrait à part.
      where: { paidAt: { gte: periodStart, lt: periodEnd }, status: { notIn: [...STATUTS_VOIDES] } },
      _sum: { amountCents: true, taxCents: true, subtotalCents: true, shippingCents: true },
      _count: { _all: true },
    }).catch(() => ({
      _sum: { amountCents: 0, taxCents: 0, subtotalCents: 0, shippingCents: 0 },
      _count: { _all: 0 },
    })),
    prisma.order.aggregate({
      where: { paidAt: { gte: prevStart, lt: prevEnd }, status: { notIn: [...STATUTS_VOIDES] } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })),
    prisma.order.groupBy({
      by: ['province'],
      where: { paidAt: { gte: periodStart, lt: periodEnd }, status: { notIn: [...STATUTS_VOIDES] } },
      _sum: { amountCents: true, taxCents: true, subtotalCents: true },
      _count: { _all: true },
    }).catch(() => []),
    prisma.order.groupBy({
      by: ['userId'],
      where: { paidAt: { gte: periodStart, lt: periodEnd }, status: { notIn: [...STATUTS_VOIDES] } },
      _sum: { amountCents: true },
      _count: { _all: true },
      orderBy: { _sum: { amountCents: 'desc' } },
      take: 8,
    }).catch(() => []),
    prisma.order.findMany({
      where: { paidAt: { gte: periodStart, lt: periodEnd }, status: { notIn: [...STATUTS_VOIDES] } },
      select: { amountCents: true, paidAt: true },
    }).catch(() => []),
    // Refunds in period — REFUND_ISSUED events. Audit v2 #10.6 — on lit
    // `data.amountCents` (montant réel) via refundAmountCentsOf au lieu de
    // sommer le total de la commande. Le champ `data` est inclus par défaut
    // (findMany sans select restrictif).
    // ⚠️ `REFUND_FAILED` CHARGÉ EN PLUS, SANS BORNE DE PÉRIODE.
    //
    // Un remboursement émis en mai peut être démenti en juillet : filtrer les
    // démentis sur la même période que les émissions raterait exactement ce
    // cas. On charge donc les deux kinds pour les COMMANDES concernées, et on
    // écarte ensuite les remboursements annulés.
    //
    // ⚠️ VÉRITÉ D'AUJOURD'HUI, décision assumée et DIFFÉRENTE du rapport de
    // taxes. Ce tableau de bord est une vue de gestion : « revenu net de mai »
    // doit refléter ce qui est réellement encaissé maintenant. Le rapport de
    // taxes, lui, est une déclaration — il laisse mai inchangé et reprend le
    // montant dans la période du démenti, pour ne jamais réécrire une période
    // déjà remise. Les deux peuvent donc diverger pour un même mois.
    prisma.orderEvent.findMany({
      where: {
        kind: { in: ['REFUND_ISSUED', 'REFUND_FAILED'] },
        // Audit admin 2026-07 §3.3 — ne compter que les refunds sur commandes
        // VIVANTES (chemin /refund) : une commande annulée est déjà exclue du brut,
        // soustraire aussi son refund la retrancherait deux fois.
        order: {
          status: { notIn: [...STATUTS_VOIDES] },
          events: { some: { kind: 'REFUND_ISSUED', createdAt: { gte: periodStart, lt: periodEnd } } },
        },
      },
      include: { order: { select: { amountCents: true } } },
    }).catch(() => []),
    prisma.orderEvent.findMany({
      where: {
        kind: { in: ['REFUND_ISSUED', 'REFUND_FAILED'] },
        order: {
          status: { notIn: [...STATUTS_VOIDES] },
          events: { some: { kind: 'REFUND_ISSUED', createdAt: { gte: prevStart, lt: prevEnd } } },
        },
      },
      include: { order: { select: { amountCents: true } } },
    }).catch(() => []),
    prisma.orderEvent.findMany({
      where: { kind: 'REFUND_ISSUED' },
      include: {
        order: { select: { id: true, sinaliteOrderId: true, amountCents: true, shipName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }).catch(() => []),
    prisma.order.count().catch(() => 0),
    prisma.user.count().catch(() => 0),
    prisma.webhookEvent.count().catch(() => 0),
    // Round 23 #5 — groupBy par userId pour reseller revenue breakdown.
    // Prisma groupBy ne supporte pas JOIN sur user.resellerStatus →
    // on fait le mapping côté JS après (cheap : N userIds = 1 user query).
    prisma.order.groupBy({
      by: ['userId'],
      where: {
        paidAt: { gte: periodStart, lt: periodEnd },
        status: { notIn: [...STATUTS_VOIDES] },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    }).catch(() => []),
    // ⚠️ HORS PÉRIODE, À DESSEIN. Un écart de caisse ne se périme pas : une
    // commande encaissée et jamais rendue en juin est toujours de l'argent
    // détenu en août. Le borner à la période sélectionnée le ferait
    // disparaître de l'écran dès le lendemain — exactement le défaut qu'on
    // corrige.
    // ═══ REQUÊTE 1/2 — CANDIDATS PAR CONSTRUCTION ═══════════════════════
    // Voidée, encaissée, et AUCUN remboursement enregistré. Il ne peut donc
    // y avoir aucun bruit ici : chaque ligne est un écart. C'est là que vit le
    // cas #583 (soumission partie sans réponse, jamais remboursée), donc le
    // cas phare ne peut plus être chassé de la fenêtre par du volume.
    //
    // ⚠️ UN JET PRÉCÉDENT FAISAIT UNE SEULE REQUÊTE `paidAt desc`, en croyant
    // que soustraire les frais d'annulation suffisait à éliminer le bruit.
    // Faux : le bruit dominant est l'échec Sinalite AUTO-REMBOURSÉ
    // INTÉGRALEMENT (`stripe-process.ts`), qui n'a jamais de frais — c'est le
    // chemin FAILED-avec-`paidAt` le plus fréquent du système. Et trier par
    // date décroissante faisait PÉRIMER le plus ancien écart non réglé,
    // exactement l'inverse du « un écart de caisse ne se périme pas » écrit
    // trois lignes plus haut.
    prisma.order.findMany({
      where: {
        paidAt: { not: null },
        status: { in: [...STATUTS_VOIDES] },
        events: { none: { kind: 'REFUND_ISSUED' } },
      },
      select: {
        id: true, status: true, amountCents: true, paidAt: true,
        // `ERROR` seul : c'est là que `cancel` écrit `cancelFeeCents`. Sans
        // lui, une annulation dont les frais couvrent TOUTE la charge (donc
        // sans remboursement Stripe, donc sans `REFUND_ISSUED`) s'affichait
        // entière comme retenue.
        events: { where: { kind: { in: ['REFUND_FAILED', 'ERROR'] } }, select: { kind: true, data: true } },
      },
      orderBy: { amountCents: 'desc' },
      take: PLAFOND_RECONCILIATION,
    }).catch(() => []),
    // ═══ REQUÊTE 2/2 — REMBOURSEMENTS PARTIELS ═════════════════════════
    // Au moins un remboursement enregistré : la majorité sont intégraux et
    // ressortiront à écart nul. Population volontairement séparée pour qu'elle
    // ne consomme pas le budget de la première.
    prisma.order.findMany({
      where: {
        paidAt: { not: null },
        status: { in: [...STATUTS_VOIDES] },
        events: { some: { kind: 'REFUND_ISSUED' } },
      },
      select: {
        id: true, status: true, amountCents: true, paidAt: true,
        events: { where: { kind: { in: ['REFUND_ISSUED', 'REFUND_FAILED', 'ERROR'] } }, select: { kind: true, data: true } },
      },
      orderBy: { amountCents: 'desc' },
      take: PLAFOND_RECONCILIATION,
    }).catch(() => []),
    // Compte total des candidats, pour dire HONNÊTEMENT quand la vue tronque.
    prisma.order.count({
      where: { paidAt: { not: null }, status: { in: [...STATUTS_VOIDES] } },
    }).catch(() => 0),
  ]);

  // Argent encaissé que ni le revenu ni les remboursements ne comptent.
  const commandesVoidees = [...voideesSansRemboursement, ...voideesAvecRemboursement];
  const nonReconcilie = calculerNonReconcilie(
    commandesVoidees.map((o) => ({
      id: o.id,
      status: o.status,
      amountCents: o.amountCents,
      paidAt: o.paidAt,
      events: o.events.map((e) => ({ kind: e.kind, data: e.data })),
    })),
  );
  const vueTronquee = commandesVoidees.length < totalCandidats;

  // Round 23 #5 — Map userIds → resellerStatus, puis bucket par status.
  // Round 44 #2 — ces 2 user.findMany (resellerStatus + top customers) sont
  // mutuellement indépendants (dérivent chacun d'un résultat déjà résolu du
  // Promise.all précédent) → on les exécute en parallèle au lieu de séquentiel.
  const allRevenueUserIds = revenueByUserId.map((r) => r.userId);
  const userIds = topCustomers.map((c) => c.userId);
  const [userStatusList, topCustomerUsers] = await Promise.all([
    allRevenueUserIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: allRevenueUserIds } },
          select: { id: true, resellerStatus: true },
        }).catch(() => [])
      : Promise.resolve([] as { id: string; resellerStatus: string }[]),
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, name: true, firstName: true, lastName: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null }[]),
  ]);
  const statusByUserId = new Map(userStatusList.map((u) => [u.id, u.resellerStatus]));
  const resellerBreakdown: Record<'VERIFIED' | 'AUTO_DETECTED' | 'NONE', { revenueCents: number; orderCount: number; customerCount: number }> = {
    VERIFIED:      { revenueCents: 0, orderCount: 0, customerCount: 0 },
    AUTO_DETECTED: { revenueCents: 0, orderCount: 0, customerCount: 0 },
    NONE:          { revenueCents: 0, orderCount: 0, customerCount: 0 },
  };
  for (const r of revenueByUserId) {
    const status = (statusByUserId.get(r.userId) ?? 'NONE') as 'VERIFIED' | 'AUTO_DETECTED' | 'NONE';
    const bucket = resellerBreakdown[status] ?? resellerBreakdown.NONE;
    bucket.revenueCents += r._sum.amountCents ?? 0;
    bucket.orderCount += r._count._all;
    bucket.customerCount += 1;
  }
  const totalResellerRevenue = resellerBreakdown.VERIFIED.revenueCents + resellerBreakdown.AUTO_DETECTED.revenueCents + resellerBreakdown.NONE.revenueCents;

  // ─── User lookup for top customers (résolu ci-dessus en parallèle) ──────
  const userById = new Map(topCustomerUsers.map((u) => [u.id, u]));

  // ─── Aggregates ────────────────────────────────────────────────────────
  const revCents = revenueAgg._sum.amountCents ?? 0;
  const revPrevCents = revenuePrevAgg._sum.amountCents ?? 0;
  const revDelta = revPrevCents > 0
    ? Math.round(((revCents - revPrevCents) / revPrevCents) * 100)
    : null;
  const orderCount = revenueAgg._count._all;
  const aovCents = orderCount > 0 ? Math.round(revCents / orderCount) : 0;

  // ⚠️ LE FILTRE DE PÉRIODE EST FAIT ICI, PAS DANS LE `where`. La requête
  // ramène volontairement les `REFUND_FAILED` hors période (un remboursement
  // de mai peut être démenti en juillet) ; borner en SQL les aurait perdus.
  const refundsAgg = sommeRemboursementsValidesCents(refundsInPeriod, { debut: periodStart, fin: periodEnd });
  const refundsCents = refundsAgg.totalCents;
  const refundsCount = refundsAgg.count;
  const refundsPrevCents = sommeRemboursementsValidesCents(refundsPrevPeriod, { debut: prevStart, fin: prevEnd }).totalCents;
  const refundsDelta = refundsPrevCents > 0
    ? Math.round(((refundsCents - refundsPrevCents) / refundsPrevCents) * 100)
    : null;
  const refundRate = revCents > 0 ? (refundsCents / revCents) * 100 : 0;

  const netCents = revCents - refundsCents;
  const netPrevCents = revPrevCents - refundsPrevCents;
  const netDelta = netPrevCents > 0
    ? Math.round(((netCents - netPrevCents) / netPrevCents) * 100)
    : null;

  const totalTaxCents = revenueAgg._sum.taxCents ?? 0;

  // ─── Daily chart ───────────────────────────────────────────────────────
  // Bucket from periodStart to periodEnd, one bar per day.
  const dayMs = 24 * 3600 * 1000;
  const numDays = Math.max(1, Math.ceil(periodLengthMs / dayMs));
  const byDay = new Map<string, number>();
  for (let i = 0; i < numDays; i++) {
    const d = new Date(periodStart.getTime() + i * dayMs);
    d.setHours(0, 0, 0, 0);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of paidOrdersInPeriod) {
    if (!o.paidAt) continue;
    const key = o.paidAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + o.amountCents / 100);
  }
  const chartData = Array.from(byDay.entries()).map(([day, val]) => ({ day, val }));
  const maxVal = Math.max(1, ...chartData.map((d) => d.val));

  // ─── Province sort + total for percentages ─────────────────────────────
  const sortedProvince = [...countByProvince].sort(
    (a, b) => (b._sum.amountCents ?? 0) - (a._sum.amountCents ?? 0),
  );
  const totalForProvinces = sortedProvince.reduce((a, c) => a + (c._sum.amountCents ?? 0), 0);

  const provinceColors = ['var(--accent-primary)', 'var(--info)', 'var(--warning)', 'var(--success)', 'var(--text-muted)'];

  // Round 15 #3 : counts dynamiques via helper centralisé.
  const sidebarCountsBase = await getAdminSidebarCounts();
  const sidebarCounts = {
    ...sidebarCountsBase,
    orders: sidebarOrders,
    webhooks: sidebarWebhooks,
    users: sidebarUsers,
  };

  return (
    <div className="adm-shell">
      <AdminSidebar
        active="finances"
        user={session?.user ? { name: session.user.name ?? null, email: session.user.email ?? '', role: session.user.role } : undefined}
      />

      <main className="adm-main">
        <header className="adm-topbar">
          <div>
            <h1 className="adm-page-title">Finances</h1>
            <p className="adm-page-subtitle">
              Période : {periodLabel} · devise CAD
            </p>
          </div>
          <div className="adm-topbar-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="adm-period">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={(p === '30d' ? '/admin/finances' : `/admin/finances?period=${p}`) as Route}
                  className={period === p ? 'active' : ''}
                >
                  {PERIOD_LABELS[p]}
                </Link>
              ))}
            </div>
            <a
              href={`/api/admin/finances/export?period=${period}`}
              download
              className="btn btn-ghost"
              title="Export Excel multi-sheet (Aperçu + Commandes + Par jour + Par province)"
              style={{ fontSize: 13 }}
            >
              <Icon name="download" size={14} /> XLSX
            </a>
          </div>
        </header>

        {/* ⚠️ AVANT LES CHIFFRES DE REVENU, ET SEULEMENT S'IL Y EN A.
            Ce bloc dit ce que les tableaux du dessous NE COMPTENT PAS : le
            revenu, les remboursements, les taxes et l'export excluent tous
            CANCELLED/FAILED — à raison pour une vraie vente voidée, à tort
            quand l'argent n'a pas été rendu. Le placer après les KPI en
            ferait une note de bas de page ; c'est un écart de caisse. */}
        {/* ⚠️ LA CONDITION INCLUT LA TRONCATURE, et pas seulement le total.
            Un jet précédent rendait cette section sur `totalRetenuCents > 0`
            avec la bannière « Vue TRONQUÉE » IMBRIQUÉE dedans : une fenêtre
            saturée de lignes à écart nul donnait total = 0, donc section
            absente, donc bannière absente. Un zéro silencieux — exactement ce
            que la bannière existe pour empêcher. */}
        {(nonReconcilie.totalRetenuCents > 0 || vueTronquee) && (
          <section
            style={{
              marginBottom: 24,
              padding: 20,
              background: 'color-mix(in srgb, var(--danger) 7%, transparent)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--r-xl)',
            }}
          >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <h2 className="adm-panel-title" style={{ margin: 0, color: 'var(--danger)' }}>
                <Icon name="alert" size={15} /> Encaissé non réconcilié
                <span className="adm-panel-title-meta">toutes périodes</span>
              </h2>
              <strong style={{ fontSize: 20, color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
                ≈ {formatCurrency(nonReconcilie.totalRetenuCents / 100)}
              </strong>
            </header>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {nonReconcilie.lignes.length} commande{nonReconcilie.lignes.length > 1 ? 's' : ''} annulée
              {nonReconcilie.lignes.length > 1 ? 's' : ''} ou en échec dont l&apos;argent a été encaissé et
              n&apos;a <strong>pas manifestement été rendu</strong>. Ce montant n&apos;apparaît{' '}
              <strong>ni dans le revenu ni dans les remboursements</strong> ci-dessous — les deux excluent
              ces statuts. Les frais d&apos;annulation facturés sont déjà déduits.
            </p>
            {/* ⚠️ NE PAS PRÉSENTER CECI COMME UN SOLDE. La base ignore les
                remboursements émis depuis le dashboard Stripe — et c'est
                justement la remédiation que nos alertes recommandent. Le
                tableau sur-signale à dessein : une ligne à vérifier est
                actionnable, une ligne absente ne l'est pas. */}
            {/* ⚠️ NE PAS RÉÉCRIRE « BORNE SUPÉRIEURE » ICI. Ce contrat était FAUX
                dans les deux sens, et c'est le second qui coûte cher :
                `markRefundIssued` est appelé à la CRÉATION du remboursement.
                Si Stripe le passe ensuite à `failed` (carte fermée, banque qui
                refuse le retour), l'argent revient chez Plio et RIEN n'amende
                l'événement — il n'existe aucun handler `charge.refund.updated`.
                La ligne disparaît alors sans le moindre drapeau.
                `/api/admin/orders/[id]/refund` connaît ce cas et le filtre
                (`r.status !== 'failed'`) en lisant Stripe ; ce tableau lit les
                événements, donc il ne peut pas. */}
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <strong>Estimation, pas un solde</strong> — à vérifier dans Stripe avant d&apos;agir. Elle peut
              SUR-estimer (un remboursement fait au dashboard ne laisse aucune trace en base) comme
              SOUS-estimer (un remboursement enregistré ici peut avoir échoué chez Stripe ensuite : l&apos;argent
              revient alors chez Plio sans que rien ne l&apos;indique).
              {nonReconcilie.contientIncertain && (
                <> Les lignes marquées <strong>?</strong> portent un remboursement dont le montant est
                illisible (événement antérieur au correctif de traçabilité) : leur écart est surestimé.</>
              )}
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '6px 10px' }}>Commande</th>
                    <th style={{ padding: '6px 10px' }}>Statut</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Encaissé</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Remboursé</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Frais</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right' }}>Écart max.</th>
                  </tr>
                </thead>
                <tbody>
                  {nonReconcilie.lignes.slice(0, 10).map((l) => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '6px 10px' }}>
                        <Link href={`/admin/orders/${l.id}` as Route} style={{ fontFamily: 'var(--font-mono)' }}>
                          {referencePlio(l.id)}
                        </Link>
                      </td>
                      <td style={{ padding: '6px 10px' }}>{l.status}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(l.encaisseCents / 100)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(l.rembourseCents / 100)}
                        {l.montantIncertain && (
                          <strong title="Un remboursement existe mais son montant est illisible — l'écart est surestimé."> ?</strong>
                        )}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{formatCurrency(l.fraisRetenusCents / 100)}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(l.retenuCents / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nonReconcilie.lignes.length > 10 && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                … et {nonReconcilie.lignes.length - 10} autre{nonReconcilie.lignes.length - 10 > 1 ? 's' : ''}.
                Le total ci-dessus inclut toutes les lignes examinées.
              </p>
            )}
            {/* ⚠️ LA TRONCATURE DOIT SE VOIR. Un total tronqué présenté comme
                complet est pire qu'un total absent : le premier jet écrivait
                « le total les inclut toutes » sans le moindre indice à
                l'écran, donc certifiait une exhaustivité qu'il n'avait pas. */}
            {vueTronquee && (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
                ⚠ Vue TRONQUÉE : {commandesVoidees.length} commandes voidées examinées sur{' '}
                {totalCandidats}. Les plus GROS montants sont examinés en premier, mais le total réel
                peut être plus élevé.
              </p>
            )}
          </section>
        )}

        {/* ─── Hero stats ──────────────────────────────────────── */}
        <section className="adm-hero-stats">
          <div className="adm-hero-card featured">
            <div className="adm-hero-label">Revenu brut · {periodLabel}</div>
            <div className="adm-hero-value">
              {revCents > 0 ? Math.round(revCents / 100).toLocaleString('fr-CA') : '0'}
              <span className="unit">$ CAD</span>
            </div>
            <div className={revDelta !== null && revDelta >= 0 ? 'adm-hero-trend up' : revDelta !== null ? 'adm-hero-trend' : 'adm-hero-trend neutral'}>
              {revDelta !== null
                ? `${revDelta >= 0 ? '↑' : '↓'} ${Math.abs(revDelta)} % vs période précédente`
                : '— vs période précédente'}
            </div>
            <div className="adm-hero-meta">
              {orderCount} commande{orderCount !== 1 ? 's' : ''}
              {aovCents > 0 && ` · panier moyen ${formatCurrency(aovCents / 100)}`}
            </div>
          </div>

          <div className="adm-hero-card">
            <div className="adm-hero-label">Refunds · {periodLabel}</div>
            <div className="adm-hero-value danger">
              {refundsCents > 0 ? `−${Math.round(refundsCents / 100).toLocaleString('fr-CA')}` : '0'}
              <span className="unit">$ CAD</span>
            </div>
            <div className={`adm-hero-trend ${refundRate < 2 ? 'neutral' : ''}`}>
              {refundRate.toFixed(1)} % du brut · cible &lt; 2 % {refundRate < 2 ? <Icon name="check" size={14} /> : <Icon name="alert" size={14} />}
            </div>
            <div className="adm-hero-meta">
              {refundsCount} refund{refundsCount !== 1 ? 's' : ''} émis
              {refundsDelta !== null && ` · ${refundsDelta >= 0 ? '↑' : '↓'} ${Math.abs(refundsDelta)} % vs précédent`}
            </div>
          </div>

          <div className="adm-hero-card">
            <div className="adm-hero-label">Revenu net · {periodLabel}</div>
            <div className="adm-hero-value">
              {netCents > 0 ? Math.round(netCents / 100).toLocaleString('fr-CA') : '0'}
              <span className="unit">$ CAD</span>
            </div>
            <div className={netDelta !== null && netDelta >= 0 ? 'adm-hero-trend up' : 'adm-hero-trend neutral'}>
              {netDelta !== null
                ? `${netDelta >= 0 ? '↑' : '↓'} ${Math.abs(netDelta)} % vs période précédente`
                : '— vs période précédente'}
            </div>
            <div className="adm-hero-meta">
              brut − refunds · avant fees Stripe
            </div>
          </div>
        </section>

        {/* ─── Revenue chart ────────────────────────────────────── */}
        <section className="adm-panel" style={{ marginBottom: 24 }}>
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">
              Revenu quotidien
              <span className="adm-panel-title-meta">{periodLabel}</span>
            </h2>
            <div className="adm-chart-legend">
              <span className="adm-chart-legend-item">
                <span className="adm-chart-legend-swatch" style={{ background: 'var(--accent-primary)' }}></span>
                Revenu brut
              </span>
            </div>
          </div>
          <div className="adm-chart-full">
            {chartData.length === 0 || chartData.every((d) => d.val === 0) ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Pas de paiement traçable sur cette période — premier revenu apparaîtra ici.
              </div>
            ) : (
              <RevenueChart data={chartData} maxVal={maxVal} />
            )}
          </div>
        </section>

        {/* Round 23 #5 — Revenue par segment reseller */}
        {totalResellerRevenue > 0 && (
          <section style={{
            marginBottom: 24,
            padding: 20,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-xl)',
          }}>
            <header style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h2 className="adm-panel-title" style={{ margin: 0 }}>
                Revenu par segment reseller
                <span className="adm-panel-title-meta">{periodLabel}</span>
              </h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Total : <strong>{formatCurrency(totalResellerRevenue / 100)}</strong>
              </span>
            </header>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {([
                { key: 'VERIFIED',      label: <><Icon name="check" size={14} /> Resellers vérifiés</>, color: '#1F3D2B', subtitle: 'Perks 5% appliquées' },
                { key: 'AUTO_DETECTED', label: '~ Auto-détectés',      color: '#5B7A6A', subtitle: 'Candidats reseller' },
                { key: 'NONE',          label: 'Standard',             color: 'var(--text-muted)', subtitle: 'Customers réguliers' },
              ] as const).map((seg) => {
                const data = resellerBreakdown[seg.key];
                const pct = totalResellerRevenue > 0 ? Math.round((data.revenueCents / totalResellerRevenue) * 100) : 0;
                return (
                  <div key={seg.key} style={{
                    padding: 16,
                    background: 'var(--bg-canvas)',
                    border: `1px solid var(--border-subtle)`,
                    borderRadius: 'var(--r-md)',
                    borderLeft: `3px solid ${seg.color}`,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: seg.color,
                      fontWeight: 700,
                      marginBottom: 4,
                    }}>
                      {seg.label}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 24,
                      fontWeight: 400,
                      letterSpacing: '-0.02em',
                      color: 'var(--text-primary)',
                    }}>
                      {formatCurrency(data.revenueCents / 100)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {pct}% du total · {data.orderCount} order{data.orderCount > 1 ? 's' : ''} · {data.customerCount} customer{data.customerCount > 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                      {seg.subtitle}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Revenu par province + Top customers ──────────────── */}
        <section className="adm-grid-equal">
          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Revenu par province
                <span className="adm-panel-title-meta">{periodLabel}</span>
              </h2>
            </div>
            <div>
              {sortedProvince.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune commande pour cette période.
                </div>
              ) : sortedProvince.map((p, i) => {
                const amt = p._sum.amountCents ?? 0;
                const pct = totalForProvinces > 0 ? Math.round((amt / totalForProvinces) * 100) : 0;
                return (
                  <div key={p.province} className="adm-cat-row">
                    <div>
                      <div className="adm-cat-head">
                        <span className="adm-cat-name">{p.province}</span>
                        <span className="adm-cat-amount">{formatCurrency(amt / 100)}</span>
                      </div>
                      <div className="adm-cat-bar">
                        <div
                          className="adm-cat-bar-fill"
                          style={{ width: `${Math.max(2, pct)}%`, background: provinceColors[i % provinceColors.length] }}
                        ></div>
                      </div>
                    </div>
                    <div className="adm-cat-pct">{pct} %</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Top clients
                <span className="adm-panel-title-meta">{periodLabel} · top 8</span>
              </h2>
              <Link href={'/admin/users' as Route} className="adm-panel-link">Tous →</Link>
            </div>
            <div>
              {topCustomers.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucun client classé pour cette période.
                </div>
              ) : topCustomers.map((c, i) => {
                const u = userById.get(c.userId);
                const rank = String(i + 1).padStart(2, '0');
                const displayName = u?.name
                  ?? [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim()
                  ?? u?.email.split('@')[0]
                  ?? 'Inconnu';
                return (
                  <Link
                    key={c.userId}
                    href={`/admin/users/${c.userId}` as Route}
                    className="adm-lead-row"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <span className={`adm-lead-rank${i < 3 ? ' top' : ''}`}>{rank}</span>
                    <div className="adm-lead-name">
                      <span className="adm-lead-name-text">{displayName}</span>
                      {i < 3 && <span className="badge badge-accent">VIP</span>}
                      <span className="adm-lead-name-meta">· {c._count._all} commande{c._count._all !== 1 ? 's' : ''}</span>
                    </div>
                    <span className="adm-lead-total">{formatCurrency((c._sum.amountCents ?? 0) / 100)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Stripe payouts + Refunds ─────────────────────────── */}
        <section className="adm-grid-equal">
          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Virements Stripe
                <span className="adm-panel-title-meta">payouts vers compte bancaire</span>
              </h2>
              <a
                href="https://dashboard.stripe.com/payouts"
                target="_blank"
                rel="noreferrer noopener"
                className="adm-panel-link"
              >↗ Stripe Dashboard</a>
            </div>
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 12 }}><Icon name="card" size={32} /></div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                Les payouts ne sont pas synchronisés localement.
              </div>
              <div style={{ fontSize: 12 }}>
                Consulte le dashboard Stripe pour le détail des virements bancaires.
              </div>
            </div>
          </div>

          <div className="adm-panel">
            <div className="adm-panel-header">
              <h2 className="adm-panel-title">
                Refunds récents
                <span className="adm-panel-title-meta">5 derniers · global</span>
              </h2>
            </div>
            {recentRefundEvents.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Aucun refund émis.
              </div>
            ) : (
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Client</th>
                    <th className="num">Montant *</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRefundEvents.map((e) => {
                    const ref = e.order.sinaliteOrderId
                      ? `#SIN-${e.order.sinaliteOrderId}`
                      : `#${e.order.id.slice(-6).toUpperCase()}`;
                    return (
                      <tr key={e.id}>
                        <td className="t-mono">{formatDate(e.createdAt.toISOString())}</td>
                        <td>
                          <Link href={`/admin/orders/${e.order.id}` as Route} className="ref">
                            {ref}
                          </Link>
                        </td>
                        <td className="muted">{e.order.shipName}</td>
                        <td className="num">−{formatCurrency(refundAmountCentsOf(e) / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {recentRefundEvents.length > 0 && (
              <div style={{ padding: '8px 24px 16px', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                * Montant exact pour les remboursements récents ; les anciens (avant le suivi du montant) affichent le total de la commande.
              </div>
            )}
          </div>
        </section>

        {/* ─── Tax breakdown ───────────────────────────────────── */}
        <section className="adm-panel" style={{ marginBottom: 24 }}>
          <div className="adm-panel-header">
            <h2 className="adm-panel-title">
              Taxes collectées par province
              <span className="adm-panel-title-meta">{periodLabel} · à remettre</span>
            </h2>
            <span className="badge badge-info">
              Total {formatCurrency(totalTaxCents / 100)} collectés
            </span>
          </div>
          {sortedProvince.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Aucune taxe collectée sur cette période.
            </div>
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Province</th>
                  <th>Base imposable</th>
                  <th className="num">Taxes collectées</th>
                  <th className="num">Commandes</th>
                </tr>
              </thead>
              <tbody>
                {sortedProvince.map((p) => (
                  <tr key={p.province}>
                    <td><span className="adm-tax-prov">{p.province}</span></td>
                    <td className="adm-tax-base">{formatCurrency((p._sum.subtotalCents ?? 0) / 100)}</td>
                    <td className="num">{formatCurrency((p._sum.taxCents ?? 0) / 100)}</td>
                    <td className="num">{p._count._all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── Export footer (placeholders) ───────────────────── */}
        <div className="adm-export-bar">
          <div>
            <div className="adm-export-label">Exporter pour comptabilité</div>
            <div className="adm-export-desc">
              Tous les exports filtrent sur la période active · {periodLabel}
            </div>
          </div>
          <div className="adm-export-actions">
            <Link href={'/admin/orders' as Route} className="btn btn-secondary btn-sm">↓ CSV ventes</Link>
            <Link href={'/admin/finances/tax-report' as Route} className="btn btn-primary btn-sm">↓ Rapport taxes TPS/TVQ</Link>
            <Link href={'/admin/finances/products' as Route} className="btn btn-secondary btn-sm">↓ Sales par produit</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function computeRange(period: Period, now: Date): { start: Date; end: Date; label: string } {
  const end = new Date(now);
  const start = new Date(now);
  let label = '';

  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    label = `aujourd'hui (${formatDate(start.toISOString())})`;
  } else if (period === '7d') {
    start.setTime(now.getTime() - 7 * 24 * 3600 * 1000);
    label = '7 derniers jours';
  } else if (period === '30d') {
    start.setTime(now.getTime() - 30 * 24 * 3600 * 1000);
    label = '30 derniers jours';
  } else if (period === 'mtd') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    label = `mois en cours (${formatDate(start.toISOString())} – aujourd'hui)`;
  } else if (period === 'ytd') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    label = `année en cours (${start.getFullYear()})`;
  }
  return { start, end, label };
}

function RevenueChart({ data, maxVal }: { data: { day: string; val: number }[]; maxVal: number }) {
  const W = 800, H = 240;
  const yAxisW = 60;
  const innerW = W - yAxisW - 20;
  const innerH = H - 40;
  const stepX = innerW / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => {
    const x = yAxisW + i * stepX;
    const y = 20 + (innerH - (d.val / maxVal) * innerH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M${pts.join(' L')}`;
  const areaPath = `M${yAxisW},${H - 20} L${pts.join(' L')} L${(yAxisW + (data.length - 1) * stepX).toFixed(1)},${H - 20} Z`;
  const yLabels = [maxVal, (maxVal * 3) / 4, maxVal / 2, maxVal / 4, 0];

  return (
    <>
      <svg className="adm-chart-svg-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {yLabels.map((v, i) => (
          <text key={i} x={6} y={20 + (innerH * i) / 4 + 4} className="adm-chart-y-label">
            {Math.round(v).toLocaleString('fr-CA')} $
          </text>
        ))}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={yAxisW}
            y1={20 + (innerH * i) / 4}
            x2={W}
            y2={20 + (innerH * i) / 4}
            stroke="var(--border-subtle)"
            strokeDasharray="2 4"
          />
        ))}
        <line x1={yAxisW} y1={H - 20} x2={W} y2={H - 20} stroke="var(--border-default)" />
        <defs>
          <linearGradient id="fin-rev-area" x1={0} y1={0} x2={0} y2={1}>
            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.24} />
            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#fin-rev-area)" />
        <path d={path} fill="none" stroke="var(--accent-primary)" strokeWidth={2} />
      </svg>
      <div className="adm-chart-axis-x" style={{ paddingLeft: 64 }}>
        <span>{data[0]?.day.slice(5).replace('-', '/')}</span>
        {data.length > 4 && <span>{data[Math.floor(data.length / 4)]?.day.slice(5).replace('-', '/')}</span>}
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.day.slice(5).replace('-', '/')}</span>}
        {data.length > 4 && <span>{data[Math.floor((data.length * 3) / 4)]?.day.slice(5).replace('-', '/')}</span>}
        <span>aujourd'hui</span>
      </div>
    </>
  );
}
