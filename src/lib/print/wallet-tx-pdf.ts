/**
 * Génération PDF d'un reçu pour une seule WalletTransaction.
 *
 * Round 24 #1. Use case : audit comptable, justificatif pour entreprise
 * qui veut associer la dépense wallet à une commande spécifique.
 *
 * Pattern reuse : même style que generateTimelinePdf (Round 19 #5) —
 * pdf-lib, Y-cursor, KV rows, branding header simple.
 */

import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { WalletTransaction } from '@prisma/client';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 60;

const KIND_DESCRIPTIONS: Record<string, string> = {
  TOPUP: 'Recharge wallet via Stripe',
  TOPUP_BONUS: 'Bonus tier appliqué',
  ORDER_SPEND: 'Utilisation au checkout',
  REFUND: 'Crédit reversé (refund)',
  ADMIN_ADJUSTMENT: 'Ajustement manuel admin',
  EXPIRY: 'Crédit expiré (inactif 12 mois)',
};

export interface WalletTxPdfInput {
  tx: WalletTransaction;
  customer: { name: string | null; email: string };
}

function cad(cents: number): string {
  const abs = Math.abs(cents);
  return `${(abs / 100).toFixed(2).replace('.', ',')} $`;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('fr-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export async function generateWalletTxPdf(input: WalletTxPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fontBody = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  let y = PAGE_H - MARGIN;
  const { tx, customer } = input;
  const isCredit = tx.amountCents > 0;

  // Header
  page.drawText('Reçu transaction wallet', {
    x: MARGIN, y, size: 22, font: fontBold, color: rgb(0.12, 0.24, 0.17),
  });
  y -= 28;
  page.drawText('Plio · Démocratik inc.', {
    x: MARGIN, y, size: 10, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });
  y -= 36;

  // KV rows : core info
  drawKV(page, MARGIN, y, 'Transaction ID', tx.id.toUpperCase(), fontBody, fontBold, fontMono);
  y -= 18;
  drawKV(page, MARGIN, y, 'Date', formatDateTime(tx.createdAt), fontBody, fontBody, fontMono);
  y -= 18;
  drawKV(page, MARGIN, y, 'Client', customer.name ?? customer.email, fontBody, fontBody, fontMono);
  y -= 18;
  drawKV(page, MARGIN, y, 'Email', customer.email, fontBody, fontBody, fontMono);
  y -= 30;

  // Transaction details box
  page.drawRectangle({
    x: MARGIN, y: y - 100,
    width: PAGE_W - 2 * MARGIN, height: 100,
    color: rgb(0.97, 0.97, 0.94),
    borderColor: rgb(0.85, 0.85, 0.82),
    borderWidth: 1,
  });

  const boxY = y - 18;
  page.drawText('Type de transaction', {
    x: MARGIN + 16, y: boxY, size: 9, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(KIND_DESCRIPTIONS[tx.kind] ?? tx.kind, {
    x: MARGIN + 16, y: boxY - 14, size: 12, font: fontBold,
  });

  // Amount avec sign + color hint
  const amountColor = isCredit ? rgb(0.09, 0.64, 0.29) : rgb(0.12, 0.18, 0.12);
  page.drawText('Montant', {
    x: PAGE_W - MARGIN - 180, y: boxY, size: 9, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(`${isCredit ? '+' : '-'}${cad(tx.amountCents)}`, {
    x: PAGE_W - MARGIN - 180, y: boxY - 18, size: 18, font: fontBold, color: amountColor,
  });

  page.drawText('Solde après transaction', {
    x: MARGIN + 16, y: boxY - 44, size: 9, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(cad(tx.balanceAfterCents), {
    x: MARGIN + 16, y: boxY - 60, size: 14, font: fontBold,
  });

  y -= 120;

  // Description
  page.drawText('Description', {
    x: MARGIN, y, size: 11, font: fontBold,
  });
  y -= 16;
  page.drawText(tx.description.slice(0, 200), {
    x: MARGIN, y, size: 10, font: fontBody, color: rgb(0.2, 0.2, 0.2),
  });
  y -= 30;

  // References (orderId, paymentIntentId, adminId si applicable)
  if (tx.orderId || tx.paymentIntentId || tx.adminId) {
    page.drawText('Références', {
      x: MARGIN, y, size: 11, font: fontBold,
    });
    y -= 16;
    if (tx.orderId) {
      drawKV(page, MARGIN, y, 'Order ID', tx.orderId, fontBody, fontMono, fontMono);
      y -= 16;
    }
    if (tx.paymentIntentId) {
      drawKV(page, MARGIN, y, 'Stripe Intent', tx.paymentIntentId, fontBody, fontMono, fontMono);
      y -= 16;
    }
    if (tx.adminId) {
      drawKV(page, MARGIN, y, 'Admin (ajust.)', tx.adminId, fontBody, fontMono, fontMono);
      y -= 16;
    }
  }

  // Footer
  page.drawText(`Généré le ${formatDateTime(new Date())} · plio.ca · bonjour@plio.ca`, {
    x: MARGIN, y: MARGIN / 2, size: 8, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}

function drawKV(
  page: PDFPage,
  x: number, y: number,
  label: string, value: string,
  labelFont: unknown,
  valueFont: unknown,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _monoFont: unknown,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.drawText(label, { x, y, size: 10, font: labelFont as any, color: rgb(0.4, 0.4, 0.4) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.drawText(value, { x: x + 120, y, size: 10, font: valueFont as any });
}
