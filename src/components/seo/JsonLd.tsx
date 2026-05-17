/**
 * Composant pour injecter du JSON-LD structured data (schema.org).
 *
 * Avantages SEO :
 *   - Google Knowledge Panel pour la marque
 *   - Rich snippets dans les SERP (étoiles, prix, breadcrumbs)
 *   - Sitelinks search box
 *   - Local pack si LocalBusiness avec address
 *
 * Usage : `<JsonLd data={organizationSchema} />` dans le layout root
 * ou n'importe quelle page. Server Component-safe (pas de hooks).
 */

import 'server-only';

interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
}

export default function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // dangerouslySetInnerHTML acceptable ici : on contrôle 100% le contenu,
      // pas de user input dans les schemas (que des constantes server-side).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ─── Schemas réutilisables ─────────────────────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.plio.ca';

/**
 * Organization schema — vendeur derrière Plio. Apparait dans Google
 * Knowledge Panel + Brand SERP. Inclut logo + sameAs (social links).
 */
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${APP_URL}/#organization`,
  name: 'Plio',
  legalName: 'Démocratik inc.',
  alternateName: 'Plio.ca',
  url: APP_URL,
  logo: `${APP_URL}/opengraph-image`,
  description: 'Print wholesale au Canada. Devis instantané, prix transparent, livraison partout au Canada en 1 à 7 jours.',
  foundingDate: '2026',
  founder: {
    '@type': 'Person',
    name: 'Patrick Thauvette',
  },
  address: {
    '@type': 'PostalAddress',
    streetAddress: '4220 boul. St-Laurent, suite 200',
    addressLocality: 'Montréal',
    addressRegion: 'QC',
    postalCode: 'H2W 1Z3',
    addressCountry: 'CA',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'bonjour@plio.ca',
    availableLanguage: ['French', 'English'],
    areaServed: 'CA',
  },
  areaServed: {
    '@type': 'Country',
    name: 'Canada',
  },
};

/**
 * WebSite schema — déclare le site + active la sitelinks search box
 * dans Google SERP (autocomplete depuis Google directement vers
 * /order/start avec le query).
 */
export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${APP_URL}/#website`,
  url: APP_URL,
  name: 'Plio',
  description: 'Print wholesale au Canada · Devis instantané',
  publisher: { '@id': `${APP_URL}/#organization` },
  inLanguage: 'fr-CA',
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${APP_URL}/order/start?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
};

/**
 * LocalBusiness schema — pour Google Maps + Local Pack. Le service
 * area est CA-wide (livraison), pas un commerce physique walk-in.
 */
export const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${APP_URL}/#localbusiness`,
  name: 'Plio',
  image: `${APP_URL}/opengraph-image`,
  url: APP_URL,
  telephone: '+1-514-555-0144',
  email: 'bonjour@plio.ca',
  priceRange: '$',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '4220 boul. St-Laurent, suite 200',
    addressLocality: 'Montréal',
    addressRegion: 'QC',
    postalCode: 'H2W 1Z3',
    addressCountry: 'CA',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 45.5223,
    longitude: -73.5947,
  },
  areaServed: {
    '@type': 'Country',
    name: 'Canada',
  },
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '18:00',
    },
  ],
};

/**
 * BreadcrumbList helper — à utiliser sur les pages wizard / produit.
 * Chaque page passe son chemin de breadcrumbs personnalisé.
 *
 * @example
 *   <JsonLd data={breadcrumbSchema([
 *     { name: 'Accueil', path: '/' },
 *     { name: 'Commander', path: '/order/start' },
 *     { name: 'Cartes de visite', path: '/order/product?category=cartes' },
 *   ])} />
 */
export function breadcrumbSchema(crumbs: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.path.startsWith('http') ? c.path : `${APP_URL}${c.path}`,
    })),
  };
}
