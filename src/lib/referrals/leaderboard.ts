/**
 * Leaderboard logic — pure helpers + Prisma query.
 *
 * Round 19 #2 — gamification : top referrers par revenue earned. Affiche
 * anonymisé sauf si c'est le user courant (display "Toi (rang 3) — 250 $").
 */

import { prisma } from '@/lib/db';

export interface LeaderboardEntry {
  userId: string;
  rank: number;
  /** Email tronqué pour anonymisation : "jo***@plio.ca". */
  displayName: string;
  /** Total créditCents gagné (status=CREDITED uniquement). */
  totalCreditCents: number;
  /** Nombre de filleuls. */
  refereeCount: number;
  /** True si c'est l'user courant — UI met une bordure highlight. */
  isMe: boolean;
}

/**
 * Anonymise un email : "patrick@plio.ca" → "pa***@plio.ca"
 * Garde 2 premiers chars + domaine pour reconnaissance discrète.
 */
export function anonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * Query top N referrers par revenue gagné + user courant si pas dans le top.
 *
 * Stratégie : groupBy ReferralReward par referrerId où status=CREDITED.
 * Sort par sum desc. Limit topN. Si l'user courant n'est pas dedans, on
 * fait une 2e query pour son rang exact (groupBy + count).
 */
export async function getLeaderboard(opts: {
  currentUserId: string;
  topN?: number;
}): Promise<{ top: LeaderboardEntry[]; me: LeaderboardEntry | null }> {
  const topN = opts.topN ?? 5;

  // 1. Top N par sum
  const grouped = await prisma.referralReward.groupBy({
    by: ['referrerId'],
    where: { status: 'CREDITED' },
    _sum: { creditCents: true },
    _count: { _all: true },
    orderBy: { _sum: { creditCents: 'desc' } },
    take: topN,
  });

  // 2. Fetch les emails pour anonymisation
  const userIds = grouped.map((g) => g.referrerId);
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true },
      })
    : [];
  const emailById = new Map(users.map((u) => [u.id, u.email]));

  const top: LeaderboardEntry[] = grouped.map((g, idx) => ({
    userId: g.referrerId,
    rank: idx + 1,
    displayName: g.referrerId === opts.currentUserId
      ? 'Toi'
      : anonymizeEmail(emailById.get(g.referrerId) ?? '***@***'),
    totalCreditCents: g._sum.creditCents ?? 0,
    refereeCount: g._count._all,
    isMe: g.referrerId === opts.currentUserId,
  }));

  // 3. Si user courant pas dans top → compute son rang
  let me: LeaderboardEntry | null = null;
  const meInTop = top.find((e) => e.isMe);
  if (!meInTop) {
    const myStats = await prisma.referralReward.aggregate({
      where: { referrerId: opts.currentUserId, status: 'CREDITED' },
      _sum: { creditCents: true },
      _count: { _all: true },
    });
    const myTotal = myStats._sum.creditCents ?? 0;
    if (myTotal > 0) {
      // Compte combien d'autres referrers ont un total >= myTotal
      const aboveMe = await prisma.referralReward.groupBy({
        by: ['referrerId'],
        where: { status: 'CREDITED' },
        _sum: { creditCents: true },
        having: { creditCents: { _sum: { gt: myTotal } } },
      });
      me = {
        userId: opts.currentUserId,
        rank: aboveMe.length + 1,
        displayName: 'Toi',
        totalCreditCents: myTotal,
        refereeCount: myStats._count._all,
        isMe: true,
      };
    }
  }

  return { top, me };
}
