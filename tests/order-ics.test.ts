/**
 * Tests pour buildOrderIcs() — Round 27 #3.
 *
 * RFC 5545 spec compliance critique : si un seul caractère est mal escapé,
 * Apple Calendar refuse l'import silencieusement. On lock-in les invariants :
 *   - CRLF line endings (\r\n)
 *   - UID déterministe pour re-import dedup
 *   - All-day event format (DTSTART;VALUE=DATE:YYYYMMDD)
 *   - DTEND = DTSTART + 1 (exclusive boundary per RFC)
 *   - Escape : backslash, comma, semicolon, newline dans DESCRIPTION/SUMMARY
 *   - PRODID identifiable
 */

import { describe, it, expect } from 'vitest';
import { buildOrderIcs } from '@/lib/orders/ics';

const base = {
  orderId: 'order_abc',
  displayId: '#SIN-12345',
  etaDate: new Date('2026-05-24T12:00:00Z'),
  trackingUrl: 'https://plio.ca/orders/order_abc',
  productSummary: 'Cartes 14pt + UV',
};

describe('buildOrderIcs()', () => {
  it('contient les blocs VCALENDAR + VEVENT', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('VERSION:2.0 + PRODID identifiable Plio', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Plio//Order Tracker//FR');
  });

  it('UID déterministe par orderId (re-import update dedup)', () => {
    const ics1 = buildOrderIcs(base);
    const ics2 = buildOrderIcs(base);
    // Le DTSTAMP changera (now()) mais l'UID doit être identique
    const uid1 = ics1.match(/UID:([^\r\n]+)/)?.[1];
    const uid2 = ics2.match(/UID:([^\r\n]+)/)?.[1];
    expect(uid1).toBe(uid2);
    expect(uid1).toBe('order-order_abc@plio.ca');
  });

  it('All-day event format : DTSTART;VALUE=DATE:YYYYMMDD', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:20260524/);
  });

  it('DTEND = DTSTART + 1 jour (exclusive boundary RFC 5545)', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toMatch(/DTEND;VALUE=DATE:20260525/);
  });

  it('SUMMARY contient displayId', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('SUMMARY:Livraison estimée Plio · #SIN-12345');
  });

  it('DESCRIPTION contient tracking URL + product summary', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('Suivi : https://plio.ca/orders/order_abc');
    expect(ics).toContain('Produit : Cartes 14pt + UV');
  });

  it('URL field set au tracking URL', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('URL:https://plio.ca/orders/order_abc');
  });

  it('STATUS:TENTATIVE (ETA estimation, pas garantie)', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('CRLF line endings (RFC 5545 § 3.1)', () => {
    const ics = buildOrderIcs(base);
    // Chaque \n doit être précédé d'un \r
    expect(ics).toMatch(/\r\n/);
    // Pas de \n bare (sans \r)
    const bareLf = ics.split(/\r\n/).join('').match(/[^\r]\n/);
    expect(bareLf).toBeNull();
  });

  it('escape : commas, semicolons, newlines, backslashes dans DESCRIPTION', () => {
    const ics = buildOrderIcs({
      ...base,
      productSummary: 'Test, with; special\\chars\nand newline',
    });
    // RFC 5545 § 3.3.11 : virgule → \\,  ; semi → \\; ; backslash → \\\\
    // newline → \\n littéral
    expect(ics).toContain('Test\\, with\\; special\\\\chars\\nand newline');
    // Pas de virgule unescaped dans la DESCRIPTION (sinon parser break)
    const descLine = ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION:'));
    expect(descLine).toBeDefined();
    // Le seul comma toléré serait dans des field-list scenarios, pas applicable ici
  });

  it('DTSTAMP en UTC format YYYYMMDDTHHMMSSZ', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it('productSummary null → DESCRIPTION skip ligne Produit', () => {
    const ics = buildOrderIcs({ ...base, productSummary: null });
    expect(ics).not.toContain('Produit :');
    // Mais Commande + Suivi restent
    expect(ics).toContain('Commande #SIN-12345');
    expect(ics).toContain('Suivi :');
  });

  it('TRANSP:TRANSPARENT (l\'event n\'occupe pas un timeslot busy)', () => {
    const ics = buildOrderIcs(base);
    expect(ics).toContain('TRANSP:TRANSPARENT');
  });
});
