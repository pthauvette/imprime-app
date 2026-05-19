/**
 * GET /api/admin/search?q=string
 *
 * Recherche transverse pour admin : un seul endpoint qui cherche dans
 * Orders, Users, ContactMessages, CustomQuoteRequest, ResellerApplication.
 *
 * Stratégie pragmatique pour MVP :
 *   - Match prefix/contains insensible à la casse sur les colonnes utiles
 *   - Limite à 20 résultats par type (max 100 total)
 *   - Score implicite par type (orders > users > messages, par exemple)
 *   - Pas de full-text Postgres pour MVP (ajout possible plus tard)
 *
 * Auth admin obligatoire (data leak risk).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withErrorHandler } from '@/lib/api-helpers';
import { requireAdmin } from '@/lib/admin-auth';

interface ResultItem {
  type: 'order' | 'user' | 'message' | 'quote' | 'reseller' | 'broadcast';
  id: string;
  href: string;
  primary: string;
  secondary?: string;
  meta?: string;
}

const PER_TYPE = 20;

export const GET = withErrorHandler(async (req: Request) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ ok: true, q, results: [], count: 0 });
  }

  const ilike = { contains: q, mode: 'insensitive' as const };

  const [orders, users, messages, quotes, resellers, broadcasts] = await Promise.all([
    prisma.order.findMany({
      where: {
        OR: [
          { id: ilike },
          { sinaliteOrderId: ilike },
          { shipName: ilike },
          { shipCity: ilike },
          { productSummary: ilike },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_TYPE,
      select: {
        id: true,
        status: true,
        sinaliteOrderId: true,
        shipName: true,
        shipCity: true,
        productSummary: true,
        amountCents: true,
        createdAt: true,
      },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { email: ilike },
          { name: ilike },
          { firstName: ilike },
          { lastName: ilike },
          { phone: ilike },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_TYPE,
      select: {
        id: true,
        email: true,
        name: true,
        firstName: true,
        lastName: true,
        role: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.contactMessage.findMany({
      where: {
        OR: [
          { email: ilike },
          { name: ilike },
          { subject: ilike },
          { message: ilike },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_TYPE,
      select: {
        id: true,
        email: true,
        name: true,
        subject: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.customQuoteRequest.findMany({
      where: {
        OR: [
          { email: ilike },
          { name: ilike },
          { companyName: ilike },
          { projectType: ilike },
          { description: ilike },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_TYPE,
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        projectType: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.resellerApplication.findMany({
      where: {
        OR: [
          { email: ilike },
          { contactName: ilike },
          { companyName: ilike },
          { website: ilike },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_TYPE,
      select: {
        id: true,
        email: true,
        contactName: true,
        companyName: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.emailBroadcast.findMany({
      where: {
        OR: [
          { subject: ilike },
          { body: ilike },
          { notes: ilike },
          { adminEmail: ilike },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_TYPE,
      select: {
        id: true,
        subject: true,
        segment: true,
        status: true,
        recipientCount: true,
        adminEmail: true,
        createdAt: true,
      },
    }),
  ]);

  const results: ResultItem[] = [];

  for (const o of orders) {
    const ref = o.sinaliteOrderId ?? o.id.slice(-6).toUpperCase();
    results.push({
      type: 'order',
      id: o.id,
      href: `/admin/orders/${o.id}`,
      primary: `#${ref} · ${o.productSummary ?? 'Commande'}`,
      secondary: `${o.shipName} · ${o.shipCity}`,
      meta: `${o.status} · $${(o.amountCents / 100).toFixed(2)}`,
    });
  }
  for (const u of users) {
    const displayName = u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email.split('@')[0]);
    results.push({
      type: 'user',
      id: u.id,
      href: `/admin/users/${u.id}`,
      primary: displayName,
      secondary: u.email,
      meta: `${u.role} · ${u._count.orders} cmd${u._count.orders > 1 ? 's' : ''}`,
    });
  }
  for (const m of messages) {
    results.push({
      type: 'message',
      id: m.id,
      href: `/admin/messages?status=${m.status}`,
      primary: m.subject,
      secondary: `${m.name} <${m.email}>`,
      meta: `${m.status} · ${m.createdAt.toLocaleDateString('fr-CA')}`,
    });
  }
  for (const q2 of quotes) {
    results.push({
      type: 'quote',
      id: q2.id,
      href: `/admin/quotes?status=${q2.status}`,
      primary: `${q2.projectType.slice(0, 60)}`,
      secondary: `${q2.name}${q2.companyName ? ` (${q2.companyName})` : ''} · ${q2.email}`,
      meta: `${q2.status} · ${q2.createdAt.toLocaleDateString('fr-CA')}`,
    });
  }
  for (const r of resellers) {
    results.push({
      type: 'reseller',
      id: r.id,
      href: `/admin/reseller-applications?status=${r.status}`,
      primary: r.companyName,
      secondary: `${r.contactName} · ${r.email}`,
      meta: `${r.status} · ${r.createdAt.toLocaleDateString('fr-CA')}`,
    });
  }
  for (const b of broadcasts) {
    results.push({
      type: 'broadcast',
      id: b.id,
      href: '/admin/broadcast',
      primary: b.subject,
      secondary: `${b.segment} · ${b.recipientCount} dest. · ${b.adminEmail}`,
      meta: `${b.status} · ${b.createdAt.toLocaleDateString('fr-CA')}`,
    });
  }

  return NextResponse.json({ ok: true, q, results, count: results.length });
});
