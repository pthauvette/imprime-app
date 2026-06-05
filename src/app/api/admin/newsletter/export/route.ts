/**
 * GET /api/admin/newsletter/export
 *
 * Export CSV des subscribers ACTIVE. Format Mailchimp-compatible
 * (email + subscribed date + source) pour import facile vers une vraie
 * plateforme d'envoi quand Patrick veut lancer ses campagnes.
 *
 * Auth : admin-only via requireAdmin().
 */

import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/admin-auth';
import { recordAdminAudit } from '@/lib/db/admin-audit';

export const dynamic = 'force-dynamic';

function csvEscape(value: string | null | undefined): string {
  const s = String(value ?? '');
  // RFC 4180 : quote si contient virgule, quote, newline. Double les quotes.
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const subscribers = await prisma.newsletterSubscriber.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { subscribedAt: 'desc' },
    select: {
      email: true,
      source: true,
      subscribedAt: true,
      consentIp: true,
    },
  });

  const header = 'email,subscribed_at,source,consent_ip';
  const rows = subscribers.map((s) =>
    [
      csvEscape(s.email),
      csvEscape(s.subscribedAt.toISOString()),
      csvEscape(s.source),
      csvEscape(s.consentIp),
    ].join(','),
  );
  const csv = [header, ...rows].join('\n');

  await recordAdminAudit({
    kind: 'ADMIN_DATA_EXPORT',
    adminId: guard.userId,
    adminEmail: guard.user.email,
    targetType: 'USER',
    targetId: 'newsletter-export',
    data: { action: 'NEWSLETTER_EXPORT', subscriberCount: subscribers.length },
  });

  const filename = `plio-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
