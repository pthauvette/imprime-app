/**
 * Helpers de formatage pour Imprime — CAD, locale fr-CA / en-CA.
 */

export type Locale = 'fr-CA' | 'en-CA';

const cadFormatters = {
  'fr-CA': new Intl.NumberFormat('fr-CA', {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'symbol',
  }),
  'en-CA': new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    currencyDisplay: 'symbol',
  }),
};

const numberFormatters = {
  'fr-CA': new Intl.NumberFormat('fr-CA'),
  'en-CA': new Intl.NumberFormat('en-CA'),
};

const dateFormatters = {
  'fr-CA': new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long' }),
  'en-CA': new Intl.DateTimeFormat('en-CA', { dateStyle: 'long' }),
};

const dateTimeFormatters = {
  'fr-CA': new Intl.DateTimeFormat('fr-CA', { dateStyle: 'long', timeStyle: 'short' }),
  'en-CA': new Intl.DateTimeFormat('en-CA', { dateStyle: 'long', timeStyle: 'short' }),
};

export function formatCurrency(amount: number, locale: Locale = 'fr-CA'): string {
  return cadFormatters[locale].format(amount);
}

export function formatNumber(n: number, locale: Locale = 'fr-CA'): string {
  return numberFormatters[locale].format(n);
}

export function formatDate(date: Date | string | number, locale: Locale = 'fr-CA'): string {
  return dateFormatters[locale].format(new Date(date));
}

export function formatDateTime(date: Date | string | number, locale: Locale = 'fr-CA'): string {
  return dateTimeFormatters[locale].format(new Date(date));
}

/** "il y a 23 minutes" / "23 minutes ago". */
export function formatRelative(date: Date | string | number, locale: Locale = 'fr-CA'): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = new Date(date).getTime() - Date.now();
  const absMs = Math.abs(diffMs);

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ];

  for (const [unit, msPerUnit] of units) {
    if (absMs >= msPerUnit) {
      return rtf.format(Math.round(diffMs / msPerUnit), unit);
    }
  }
  return rtf.format(0, 'second');
}
