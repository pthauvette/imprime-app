/**
 * Schema.org JSON-LD generators (pure data, no JSX).
 *
 * Vit dans son propre module .ts pour être testable en vitest sans
 * compiler le composant JsonLd.tsx (vitest n'a pas de plugin JSX
 * configuré, et on n'en a pas besoin pour tester les schémas).
 *
 * Le composant `JsonLd` (cf. JsonLd.tsx) re-exporte ces fonctions pour
 * backward-compat avec les imports existants.
 */

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
  // Pas de `telephone` : pas de ligne publique. Exposer un placeholder 555 dans
  // le JSON-LD (rich results) donnerait un faux numéro aux moteurs. Round 5 #4.
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

/**
 * ItemList schema — pour les pages de listing (catégorie de produits).
 * Aide Google à comprendre la structure et indexer chaque item séparément.
 */
export function itemListSchema(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      url: item.path.startsWith('http') ? item.path : `${APP_URL}${item.path}`,
    })),
  };
}

/**
 * Product schema — rich snippet pour les pages produit du wizard
 * (/order/configure?productId=N). Avec AggregateOffer (low/high) Google
 * affiche un range de prix directement dans la SERP.
 */
export interface ProductSchemaInput {
  id: number | string;
  name: string;
  description?: string | null;
  sku?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  /** Prix en cents CAD. Si fournis, génère AggregateOffer. */
  priceCents?: {
    low: number;
    high: number;
  } | null;
  /** URL canonique de la page produit. */
  pageUrl: string;
}

export function productSchema(input: ProductSchemaInput): Record<string, unknown> {
  const productUrl = input.pageUrl.startsWith('http')
    ? input.pageUrl
    : `${APP_URL}${input.pageUrl}`;

  const offer = input.priceCents && input.priceCents.high > 0
    ? {
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'CAD',
          lowPrice: (input.priceCents.low / 100).toFixed(2),
          highPrice: (input.priceCents.high / 100).toFixed(2),
          availability: 'https://schema.org/InStock',
          seller: { '@id': `${APP_URL}/#organization` },
          areaServed: { '@type': 'Country', name: 'Canada' },
        },
      }
    : {};

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${productUrl}#product`,
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.sku ? { sku: input.sku, mpn: input.sku } : {}),
    ...(input.category ? { category: input.category } : {}),
    productID: String(input.id),
    image: input.imageUrl ?? `${APP_URL}/opengraph-image`,
    url: productUrl,
    brand: {
      '@type': 'Brand',
      name: 'Plio',
      '@id': `${APP_URL}/#organization`,
    },
    manufacturer: { '@id': `${APP_URL}/#organization` },
    ...offer,
  };
}
