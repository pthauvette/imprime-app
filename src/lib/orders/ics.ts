/**
 * ICS (iCalendar / RFC 5545) generator pour les ETAs livraison.
 *
 * Round 27 #3. Émet un fichier .ics minimal compatible Google Calendar,
 * Apple Calendar, Outlook. Un seul VEVENT par order, all-day event sur
 * l'ETA, status TENTATIVE pour communiquer qu'on n'a pas de garantie.
 *
 * UID déterministe `order-{orderId}@plio.ca` :
 *   Si l'user re-import le même .ics après une mise à jour ETA, le
 *   calendrier UPDATE l'event existant au lieu de créer un duplicate
 *   (comportement standard RFC 5545 SEQUENCE handling).
 */

export interface IcsOrderInput {
  orderId: string;
  /** Display ID (ex: "#SIN-12345" ou "#A1B2C3"). */
  displayId: string;
  /** Date estimée livraison (jour seul, time-of-day ignoré). */
  etaDate: Date;
  /** URL absolue vers la page de tracking. */
  trackingUrl: string;
  /** Résumé human-readable de la commande (ex: "Cartes 14pt + UV"). */
  productSummary?: string | null;
}

/**
 * Format Date → YYYYMMDD en UTC. ICS all-day events utilisent
 * DTSTART;VALUE=DATE:20260524 (pas de timezone, pas d'heure).
 */
function formatIcsDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format Date → YYYYMMDDTHHMMSSZ UTC. Utilisé pour DTSTAMP (timestamp
 * de génération du fichier).
 */
function formatIcsDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Escape ICS text fields (DESCRIPTION, SUMMARY, etc) per RFC 5545 § 3.3.11.
 * Backslash, comma, semicolon, newline doivent être escapés.
 */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildOrderIcs(input: IcsOrderInput): string {
  const start = formatIcsDate(input.etaDate);
  // ICS all-day event : DTEND est exclusive → +1 day pour 24h
  const endDate = new Date(input.etaDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = formatIcsDate(endDate);

  const now = formatIcsDateTime(new Date());
  const summary = escapeIcsText(`Livraison estimée Plio · ${input.displayId}`);
  const descParts = [
    `Commande ${input.displayId}`,
    input.productSummary ? `Produit : ${input.productSummary}` : null,
    `Suivi : ${input.trackingUrl}`,
    '',
    'Cette date est une estimation et peut varier. Tu recevras un email quand ta commande sera expédiée.',
  ].filter((x): x is string => x !== null);
  const description = escapeIcsText(descParts.join('\n'));

  // CRLF line endings per RFC 5545 § 3.1
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plio//Order Tracker//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:order-${input.orderId}@plio.ca`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `URL:${input.trackingUrl}`,
    'STATUS:TENTATIVE',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n') + '\r\n';
}
