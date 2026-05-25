/**
 * GET /api/orders/[id]/invoice.pdf
 *
 * Génère et stream une facture PDF officielle (TPS/TVQ + identité
 * vendeur) pour une commande. Auth required : owner OR admin.
 *
 * Headers de réponse :
 *   Content-Type: application/pdf
 *   Content-Disposition: attachment; filename="facture-PLIO-XXX.pdf"
 *   Cache-Control: private, max-age=300  (cache 5 min côté client)
 *
 * Le PDF est généré à chaque request — pas de cache server-side. Pour
 * du volume on pourrait persister en S3 mais c'est overkill : pdf-lib
 * génère un PDF ~20kB en <50ms.
 */

import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { generateInvoicePdf } from '@/lib/print/invoice-pdf';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COMPANY = {
  legalName: process.env.COMPANY_LEGAL_NAME || 'Démocratik inc.',
  address: process.env.COMPANY_ADDRESS || 'Montréal QC, Canada',
  gst: process.env.COMPANY_GST_NUMBER || '(num. TPS à venir)',
  qst: process.env.COMPANY_QST_NUMBER || '(num. TVQ à venir)',
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    // Round 38 #2 — Inclure taxExempt + taxExemptCertId pour que le PDF
    // affiche "Exonéré de taxes" au lieu des TPS/TVQ jamais payés.
    include: { user: { select: { email: true, name: true, taxExempt: true, taxExemptCertId: true } } },
  });

  if (!order) {
    return new Response('Not found', { status: 404 });
  }

  // Owner-only OU admin. Pas de leak d'info si non-owner → 404 silent.
  const isOwner = order.userId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return new Response('Not found', { status: 404 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateInvoicePdf({
      order,
      customer: {
        name: order.user.name,
        email: order.user.email,
        taxExempt: order.user.taxExempt,
        taxExemptCertId: order.user.taxExemptCertId,
      },
      company: COMPANY,
    });
  } catch (err) {
    log.error({ err, orderId: id }, 'invoice PDF generation failed');
    return new Response('Error generating PDF', { status: 500 });
  }

  const displayOrderId = order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();
  const filename = `facture-plio-${displayOrderId}.pdf`;

  // Wrap dans un ArrayBuffer pour satisfaire le type BodyInit
  const ab = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength,
  ) as ArrayBuffer;

  return new Response(ab, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBytes.byteLength),
      'Cache-Control': 'private, max-age=300',
    },
  });
}
