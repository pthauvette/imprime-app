import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import JsonLd, { organizationSchema, websiteSchema, localBusinessSchema } from '@/components/seo/JsonLd';
import { LocaleProvider } from '@/components/i18n/LocaleProvider';
import { getServerLocale } from '@/lib/i18n/locale';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.plio.ca';
const SITE_NAME = 'Plio';
const TAGLINE = 'Imprime ce que tu veux, en 2 minutes';
const DESCRIPTION = 'Plio — print wholesale au Canada. Devis instantané, prix transparent, livraison partout au Canada en 1 à 7 jours. Cartes de visite, flyers, brochures imprimés à Montréal.';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `Plio — ${TAGLINE}`,
    template: '%s · Plio',
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  generator: 'Next.js',
  keywords: [
    'imprimerie en ligne',
    'print wholesale',
    'cartes de visite Canada',
    'flyers Montréal',
    'imprimerie Québec',
    'devis impression instantané',
    'Plio',
  ],
  authors: [{ name: 'Démocratik inc.', url: APP_URL }],
  creator: 'Démocratik inc.',
  publisher: 'Plio',
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: '/',
    // Plio est servi en FR par défaut + EN via toggle (cookie plio_lang).
    // Pas de hreflang URL distincts (même path) — Google va indexer la
    // version FR. Si on veut un vrai SEO bilingue, faut passer à
    // /[locale]/... routing (next-intl ou next 16 i18n native).
    languages: { 'fr-CA': APP_URL, 'en-CA': APP_URL },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_CA',
    url: APP_URL,
    siteName: SITE_NAME,
    title: `Plio — ${TAGLINE}`,
    description: DESCRIPTION,
    // Image auto-générée par src/app/opengraph-image.tsx — Next.js injecte
    // l'URL `/opengraph-image` dans la metadata automatiquement.
  },
  twitter: {
    card: 'summary_large_image',
    title: `Plio — ${TAGLINE}`,
    description: DESCRIPTION,
    // Twitter image suit l'OG image automatiquement aussi.
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#1F3D2B',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Locale lue depuis cookie plio_lang. Server-side donc le SSR + HTML lang
  // attribute matchent ce que le user a choisi. Default fr si pas de cookie.
  const locale = await getServerLocale();
  const htmlLang = locale === 'en' ? 'en-CA' : 'fr-CA';

  return (
    <html lang={htmlLang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Structured data (schema.org) — Google Knowledge Panel, Rich
            Snippets, Sitelinks search box. Injected once dans root layout,
            inherited par toutes les pages. */}
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
        <JsonLd data={localBusinessSchema} />
        <LocaleProvider initialLocale={locale}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
