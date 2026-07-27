/**
 * Génération PDF "Historique de commande" — vue customer.
 *
 * Round 19 #5. Diffère de invoice-pdf.ts (qui est le reçu fiscal officiel) :
 *   - Pas de structure légale stricte (pas de TPS/TVQ détaillé)
 *   - Focus : timeline événements + état actuel + récap montants
 *   - Use case : customer veut classer ses commandes proprement, ou
 *     prouver à son comptable que la commande a été livrée
 *
 * Layout simple en 2 colonnes (label / value) + bloc timeline en bas.
 */

import { PDFDocument, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { Order, OrderEvent } from '@prisma/client';

const PAGE_W = 612; // US Letter portrait (72dpi)
const PAGE_H = 792;
const MARGIN = 60;

// finding [49] money-path-reviewer — Record<string,...> (pas
// Record<OrderEventKind,...>) donc tsc ne signale PAS une entrée manquante :
// CANCEL_REQUESTED tombait dans le fallback `?? ev.kind` (route.ts ligne 129),
// affichant le littéral brut dans ce PDF téléchargeable par le client.
const EVENT_LABELS: Record<string, string> = {
  PAYMENT_SUCCEEDED: '💳 Paiement confirmé',
  PAYMENT_FAILED: '❌ Paiement échoué',
  SINALITE_SUBMITTED: '📤 Envoyée en production',
  SINALITE_STATUS_CHANGED: '🔄 Mise à jour statut',
  REFUND_ISSUED: '↩ Remboursement émis',
  ERROR: '⚠ Erreur',
  CANCEL_REQUESTED: '⚠ Annulation demandée',
};

export interface TimelinePdfInput {
  order: Order;
  events: OrderEvent[];
  customer: { name: string | null; email: string };
}

function cad(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} $`;
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('fr-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export async function generateTimelinePdf(input: TimelinePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fontBody = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await doc.embedFont(StandardFonts.Courier);

  let y = PAGE_H - MARGIN;

  // Header
  page.drawText('Historique de commande', {
    x: MARGIN, y, size: 22, font: fontBold, color: rgb(0.12, 0.24, 0.17),
  });
  y -= 30;
  page.drawText('Plio · Démocratik inc.', {
    x: MARGIN, y, size: 10, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });
  y -= 30;

  // Order ID + display ID
  const displayId = input.order.sinaliteOrderId
    ? `SIN-${input.order.sinaliteOrderId}`
    : input.order.id.slice(-8).toUpperCase();
  drawKV(page, MARGIN, y, 'Commande', `#${displayId}`, fontBody, fontBold, fontMono);
  y -= 18;
  drawKV(page, MARGIN, y, 'Client', `${input.customer.name ?? input.customer.email}`, fontBody, fontBold, fontMono);
  y -= 18;
  drawKV(page, MARGIN, y, 'Email', input.customer.email, fontBody, fontBody, fontMono);
  y -= 18;
  drawKV(page, MARGIN, y, 'Créée le', formatDateTime(input.order.createdAt), fontBody, fontBody, fontMono);
  y -= 18;
  if (input.order.paidAt) {
    drawKV(page, MARGIN, y, 'Payée le', formatDateTime(input.order.paidAt), fontBody, fontBody, fontMono);
    y -= 18;
  }
  drawKV(page, MARGIN, y, 'Statut actuel', input.order.status, fontBody, fontBold, fontMono);
  y -= 30;

  // Produit
  if (input.order.productSummary) {
    page.drawText('Produit', { x: MARGIN, y, size: 11, font: fontBold });
    y -= 16;
    drawWrappedText(page, MARGIN, y, input.order.productSummary, PAGE_W - 2 * MARGIN, fontBody, 10);
    y -= 30;
  }

  // Montant
  drawKV(page, MARGIN, y, 'Sous-total', cad(input.order.subtotalCents), fontBody, fontBody, fontMono);
  y -= 16;
  if (input.order.discountCents > 0) {
    drawKV(page, MARGIN, y, 'Rabais', `−${cad(input.order.discountCents)}`, fontBody, fontBody, fontMono);
    y -= 16;
  }
  drawKV(page, MARGIN, y, 'Livraison', cad(input.order.shippingCents), fontBody, fontBody, fontMono);
  y -= 16;
  drawKV(page, MARGIN, y, 'Taxes', cad(input.order.taxCents), fontBody, fontBody, fontMono);
  y -= 16;
  if (input.order.resellerDiscountCents > 0) {
    drawKV(page, MARGIN, y, 'Reseller perks (-5 %)', `−${cad(input.order.resellerDiscountCents)}`, fontBody, fontBody, fontMono);
    y -= 16;
  }
  if (input.order.walletCreditAppliedCents > 0) {
    drawKV(page, MARGIN, y, 'Crédit prépayé', `−${cad(input.order.walletCreditAppliedCents)}`, fontBody, fontBody, fontMono);
    y -= 16;
  }
  if (input.order.referralCreditAppliedCents > 0) {
    drawKV(page, MARGIN, y, 'Crédit parrainage', `−${cad(input.order.referralCreditAppliedCents)}`, fontBody, fontBody, fontMono);
    y -= 16;
  }
  drawKV(page, MARGIN, y, 'Total payé', cad(input.order.amountCents), fontBold, fontBold, fontMono);
  y -= 30;

  // Timeline
  page.drawText('Historique des événements', {
    x: MARGIN, y, size: 13, font: fontBold, color: rgb(0.12, 0.24, 0.17),
  });
  y -= 20;

  if (input.events.length === 0) {
    page.drawText('Aucun événement enregistré.', { x: MARGIN, y, size: 10, font: fontBody, color: rgb(0.5, 0.5, 0.5) });
  } else {
    for (const ev of input.events) {
      if (y < MARGIN + 30) break; // Truncate si page débord — single-page PDF for MVP
      const label = EVENT_LABELS[ev.kind] ?? ev.kind;
      page.drawText(label, { x: MARGIN, y, size: 10, font: fontBold });
      page.drawText(formatDateTime(ev.createdAt), {
        x: MARGIN + 200, y, size: 9, font: fontMono, color: rgb(0.4, 0.4, 0.4),
      });
      y -= 14;
      // OrderEvent.data est un JSON string optionnel — extract un message
      // human-friendly si présent (sinon skip la ligne details).
      const detail = extractEventDetail(ev.data);
      if (detail) {
        drawWrappedText(page, MARGIN + 12, y, detail, PAGE_W - 2 * MARGIN - 12, fontBody, 9);
        y -= 14;
      }
      y -= 4;
    }
  }

  // Footer
  page.drawText(`Généré le ${formatDateTime(new Date())} · plio.ca`, {
    x: MARGIN, y: MARGIN / 2, size: 8, font: fontBody, color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}

function drawKV(
  page: PDFPage,
  x: number, y: number,
  label: string, value: string,
  labelFont: typeof StandardFonts | unknown,
  valueFont: typeof StandardFonts | unknown,
  monoFont: typeof StandardFonts | unknown,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.drawText(label, { x, y, size: 10, font: labelFont as any, color: rgb(0.4, 0.4, 0.4) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page.drawText(value, { x: x + 110, y, size: 10, font: (label.includes('Commande') || label.includes('Total') ? monoFont : valueFont) as any });
}

function extractEventDetail(data: string | null): string | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    // Heuristic : prends le 1er field interessant (message > reason > status)
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.reason === 'string') return parsed.reason;
    if (typeof parsed.status === 'string') return `Statut : ${parsed.status}`;
    return null;
  } catch {
    return null;
  }
}

function drawWrappedText(
  page: PDFPage,
  x: number, y: number,
  text: string, maxWidth: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  font: any,
  size: number,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let yPos = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y: yPos, size, font, color: rgb(0.2, 0.2, 0.2) });
      yPos -= size + 2;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y: yPos, size, font, color: rgb(0.2, 0.2, 0.2) });
  }
  return yPos;
}
