/**
 * Génération de facture PDF officielle pour une commande Plio.
 *
 * Utilise pdf-lib (déjà installé pour le validator). Layout manuel
 * (pas de moteur flexbox) — y-cursor qui décroît au fur et à mesure.
 *
 * Compliance Loi sur la taxe d'accise art. 169 + Loi TVQ art. 350 :
 *   - Nom légal + adresse du vendeur
 *   - Numéros TPS + TVQ enregistrés
 *   - Date de facturation
 *   - N° de facture unique (= n° commande Sinalite ou cuid suffix)
 *   - Description des biens/services
 *   - Montant HT
 *   - Taxes détaillées par type (TPS, TVQ ou HST)
 *   - Montant total
 *
 * Pas de signature/sceau requis pour les ventes au Canada.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { Order } from '@prisma/client';
import { computeTax } from '@/lib/taxes';
import type { CaProvince } from '@/lib/sinalite/types';

export interface InvoicePdfInput {
  order: Order;
  customer: {
    name: string | null;
    email: string;
  };
  company: {
    legalName: string;
    address: string;
    gst: string;
    qst: string;
  };
}

// ─── Layout constants (en points, 1pt = 1/72") ────────────────────────────

const PAGE_W = 612;   // Letter 8.5"
const PAGE_H = 792;   // Letter 11"
const MARGIN = 54;    // 0.75"
const CONTENT_W = PAGE_W - MARGIN * 2;

// Couleurs Plio (vert foncé + gris) — alignées avec la marque
const COLOR_BRAND = rgb(31 / 255, 61 / 255, 43 / 255);     // #1F3D2B vert
const COLOR_TEXT = rgb(20 / 255, 28 / 255, 22 / 255);      // #141C16 noir doux
const COLOR_MUTED = rgb(122 / 255, 135 / 255, 128 / 255);  // #7A8780 gris
const COLOR_RULE = rgb(236 / 255, 234 / 255, 227 / 255);   // #ECEAE3 trait

// ─── Helpers de rendu ─────────────────────────────────────────────────────

function cad(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function dateFr(d: Date): string {
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function displayOrderId(order: Order): string {
  return order.sinaliteOrderId ?? order.id.slice(-6).toUpperCase();
}

interface Renderer {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
}

function drawText(r: Renderer, text: string, opts: {
  x: number;
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
}) {
  r.page.drawText(text, {
    x: opts.x,
    y: r.y,
    size: opts.size ?? 10,
    font: opts.bold ? r.fontBold : r.font,
    color: opts.color ?? COLOR_TEXT,
  });
}

function drawTextRight(r: Renderer, text: string, opts: {
  x: number;
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
}) {
  const font = opts.bold ? r.fontBold : r.font;
  const size = opts.size ?? 10;
  const width = font.widthOfTextAtSize(text, size);
  r.page.drawText(text, {
    x: opts.x - width,
    y: r.y,
    size,
    font,
    color: opts.color ?? COLOR_TEXT,
  });
}

function drawRule(r: Renderer, opts: { x?: number; w?: number; color?: ReturnType<typeof rgb> } = {}) {
  r.page.drawLine({
    start: { x: opts.x ?? MARGIN, y: r.y },
    end: { x: (opts.x ?? MARGIN) + (opts.w ?? CONTENT_W), y: r.y },
    thickness: 0.5,
    color: opts.color ?? COLOR_RULE,
  });
}

// ─── Generator ────────────────────────────────────────────────────────────

/**
 * Génère un PDF facture. Retourne les bytes prêts à streamer.
 * Throws sur input invalide ou Prisma data corrompue.
 */
export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { order, customer, company } = input;

  const doc = await PDFDocument.create();
  doc.setTitle(`Facture #${displayOrderId(order)} — Plio`);
  doc.setAuthor(company.legalName);
  doc.setSubject(`Facture de vente Plio · ${dateFr(order.paidAt ?? order.createdAt)}`);
  doc.setProducer('Plio.ca');
  doc.setCreator('Plio invoice generator');

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const r: Renderer = { page, font, fontBold, y: PAGE_H - MARGIN };

  // ─── HEADER ──────────────────────────────────────────────────────────
  // "Plio." wordmark (gros) + "FACTURE" à droite
  drawText(r, 'Plio.', { x: MARGIN, size: 28, bold: true, color: COLOR_BRAND });
  drawTextRight(r, 'FACTURE', { x: PAGE_W - MARGIN, size: 14, bold: true, color: COLOR_MUTED });

  r.y -= 36;
  drawRule(r);
  r.y -= 24;

  // ─── BLOC FACTURE NUMBER + DATE ──────────────────────────────────────
  drawText(r, 'N° de facture', { x: MARGIN, size: 8, color: COLOR_MUTED });
  drawText(r, 'Date', { x: MARGIN + 180, size: 8, color: COLOR_MUTED });
  drawText(r, 'Statut', { x: MARGIN + 360, size: 8, color: COLOR_MUTED });
  r.y -= 14;
  drawText(r, `#${displayOrderId(order)}`, { x: MARGIN, size: 13, bold: true });
  drawText(r, dateFr(order.paidAt ?? order.createdAt), { x: MARGIN + 180, size: 13, bold: true });
  drawText(r, order.paidAt ? 'Payée' : 'En attente', { x: MARGIN + 360, size: 13, bold: true, color: order.paidAt ? COLOR_BRAND : COLOR_MUTED });
  r.y -= 36;

  // ─── BLOC VENDEUR / CLIENT (2 colonnes) ──────────────────────────────
  const colW = (CONTENT_W - 24) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 24;

  // Labels colonnes
  drawText(r, 'VENDEUR', { x: leftX, size: 8, bold: true, color: COLOR_MUTED });
  drawText(r, 'FACTURÉ À', { x: rightX, size: 8, bold: true, color: COLOR_MUTED });
  r.y -= 14;

  // Lignes vendeur (manuel parce que multi-line)
  const vendorLines = [
    { text: company.legalName, bold: true, size: 11 },
    { text: company.address, size: 9 },
    { text: '', size: 4 },
    { text: `TPS : ${company.gst}`, size: 9 },
    { text: `TVQ : ${company.qst}`, size: 9 },
  ];
  const customerLines = [
    { text: customer.name ?? order.shipName, bold: true, size: 11 },
    { text: order.shipName, size: 9 },
    { text: order.shipLine1, size: 9 },
    ...(order.shipLine2 ? [{ text: order.shipLine2, size: 9 }] : []),
    { text: `${order.shipCity}, ${order.shipProvince}  ${order.shipPostalCode}`, size: 9 },
    { text: customer.email, size: 9, color: COLOR_MUTED as ReturnType<typeof rgb> },
  ];

  const startY = r.y;
  // Vendor
  let yL = startY;
  for (const line of vendorLines) {
    if (line.text) {
      r.page.drawText(line.text, {
        x: leftX,
        y: yL,
        size: line.size,
        font: line.bold ? fontBold : font,
        color: COLOR_TEXT,
      });
    }
    yL -= line.size + 4;
  }
  // Customer
  let yR = startY;
  for (const line of customerLines) {
    if (line.text) {
      r.page.drawText(line.text, {
        x: rightX,
        y: yR,
        size: line.size,
        font: line.bold ? fontBold : font,
        color: (line as { color?: ReturnType<typeof rgb> }).color ?? COLOR_TEXT,
      });
    }
    yR -= line.size + 4;
  }
  r.y = Math.min(yL, yR) - 16;

  drawRule(r);
  r.y -= 24;

  // ─── BLOC ITEMS (1 ligne pour MVP — wizard = 1 item par order) ───────
  // Headers
  drawText(r, 'DESCRIPTION', { x: leftX, size: 8, bold: true, color: COLOR_MUTED });
  drawTextRight(r, 'QTÉ', { x: leftX + 360, size: 8, bold: true, color: COLOR_MUTED });
  drawTextRight(r, 'MONTANT', { x: PAGE_W - MARGIN, size: 8, bold: true, color: COLOR_MUTED });
  r.y -= 14;
  drawRule(r);
  r.y -= 16;

  // Row item
  drawText(r, order.productSummary ?? 'Commande Plio', { x: leftX, size: 11, bold: true });
  drawTextRight(r, String(order.itemsCount), { x: leftX + 360, size: 11 });
  drawTextRight(r, `${cad(order.subtotalCents)} $`, { x: PAGE_W - MARGIN, size: 11 });
  r.y -= 14;
  drawText(r, `Livraison ${order.shippingMethod}`, { x: leftX, size: 9, color: COLOR_MUTED });
  drawTextRight(r, `${cad(order.shippingCents)} $`, { x: PAGE_W - MARGIN, size: 9, color: COLOR_MUTED });
  r.y -= 24;

  drawRule(r);
  r.y -= 18;

  // ─── BLOC TOTALS (aligné à droite, dernière colonne) ─────────────────
  // Recompute tax breakdown from province + taxable amount (TPS + TVQ détaillés)
  const taxableSubtotal = (order.subtotalCents - order.discountCents + order.shippingCents) / 100;
  const tax = computeTax(taxableSubtotal, order.province as CaProvince);

  const totalsX = PAGE_W - MARGIN;
  const labelX = totalsX - 180;

  function totalsRow(label: string, value: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; size?: number } = {}) {
    drawText(r, label, { x: labelX, size: opts.size ?? 10, color: opts.color ?? COLOR_MUTED });
    drawTextRight(r, value, { x: totalsX, size: opts.size ?? 10, bold: opts.bold, color: opts.color });
    r.y -= 16;
  }

  totalsRow('Sous-total', `${cad(order.subtotalCents)} $`);
  if (order.discountCents > 0) {
    // ASCII hyphen-minus (-) au lieu de U+2212 (−) — Helvetica WinAnsi
    // n'encode pas les minus Unicode.
    totalsRow('Rabais', `-${cad(order.discountCents)} $`, { color: COLOR_BRAND });
  }
  totalsRow('Livraison', `${cad(order.shippingCents)} $`);
  // Une ligne par taxe (TPS + TVQ pour QC ; HST seule pour ON/NB/NL/NS/PE ; etc.)
  for (const line of tax.lines) {
    totalsRow(line.label, `${cad(Math.round(line.amount * 100))} $`);
  }

  // Round 20 #3 — Wallet credit appliqué (préfère "Crédit prépayé" en label
  // user-friendly vs "wallet" jargon).
  if (order.walletCreditAppliedCents > 0) {
    totalsRow('Crédit prépayé', `-${cad(order.walletCreditAppliedCents)} $`, { color: COLOR_BRAND });
  }
  if (order.referralCreditAppliedCents > 0) {
    totalsRow('Crédit parrainage', `-${cad(order.referralCreditAppliedCents)} $`, { color: COLOR_BRAND });
  }

  // Trait + total à payer
  r.y -= 4;
  drawRule(r);
  r.y -= 16;
  totalsRow('TOTAL', `${cad(order.amountCents)} $ CAD`, { bold: true, size: 13, color: COLOR_BRAND });

  // ─── FOOTER ──────────────────────────────────────────────────────────
  r.y = MARGIN + 36;
  drawRule(r);
  r.y -= 14;
  drawText(r, 'Merci de faire confiance à Plio.', { x: MARGIN, size: 9, color: COLOR_MUTED });
  drawTextRight(r, 'plio.ca · bonjour@plio.ca', { x: PAGE_W - MARGIN, size: 9, color: COLOR_MUTED });
  r.y -= 14;
  drawText(r, `Facture générée le ${dateFr(new Date())}.`, { x: MARGIN, size: 7, color: COLOR_MUTED });

  return doc.save();
}
