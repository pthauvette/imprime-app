/**
 * GET /api/wallet/transactions/[id]/receipt.pdf
 *
 * Round 24 #1 — PDF receipt pour une WalletTransaction. Auth required +
 * ownership check (user ne voit que ses propres tx).
 *
 * 403 (pas 404) si ownership fail — l'user sait que la tx existe mais
 * a pas accès → message clair. Pattern identique à /api/orders/[id]/timeline.pdf.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { generateWalletTxPdf } from '@/lib/print/wallet-tx-pdf';
import { logEmail as log } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const { id } = await ctx.params;

  const tx = await prisma.walletTransaction.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, firstName: true, lastName: true } },
    },
  });

  if (!tx) {
    return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 });
  }

  // Ownership : user owner OR admin
  const isOwner = tx.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  try {
    const customerName = tx.user.name
      ?? [tx.user.firstName, tx.user.lastName].filter(Boolean).join(' ').trim()
      ?? null;
    const pdfBytes = await generateWalletTxPdf({
      tx,
      customer: { name: customerName, email: tx.user.email },
    });

    const filename = `plio-tx-${tx.id.slice(-8).toUpperCase()}.pdf`;

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-cache',
      },
    });
  } catch (err) {
    log.error({ err, txId: id }, 'wallet tx pdf generation failed');
    return NextResponse.json({ error: 'Génération PDF échouée' }, { status: 500 });
  }
}
