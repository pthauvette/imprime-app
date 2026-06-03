import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
// Round 40 #1 — migrated-pages.css contient les fixes mobile/responsive
// ajoutés depuis Round 30 (mkt-nav reflow, .adm-main padding, .ord-pills wrap,
// .od-grid mobile collapse, etc.). Avant ce import il était orphan : 196 KB
// de CSS qui ne ship pas en prod. CSS cascade : importé APRÈS globals.css
// donc ses règles override les duplicates (later imports win same-specificity ties).
// Un test (tests/css-imports.test.ts) garde cet import présent.
import '@/styles/migrated-pages.css';
import JsonLd, { organizationSchema, websiteSchema, localBusinessSchema } from '@/components/seo/JsonLd';
import { LocaleProvider } from '@/components/i18n/LocaleProvider';
import { getServerLocale } from '@/lib/i18n/locale';
import { getServerTheme } from '@/lib/theme';
import CookieConsent from '@/components/legal/CookieConsent';
import { fontVariables } from '@/lib/fonts';

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
  // Audit v2 #10.9 — `public/favicon.ico` était absent → 404 sur chaque page +
  // aucun favicon dans l'onglet. On laisse Next détecter automatiquement
  // `src/app/icon.svg` (généré, wordmark « P » sur fond brand) au lieu de
  // pointer vers un asset inexistant.
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
  // Theme lu depuis cookie plio_theme — server-side pour éviter FOUC.
  const theme = await getServerTheme();

  return (
    // Round 44 #1 — fontVariables (next/font) expose --font-body/display/mono
    // sur <html>. Le <link> bloquant vers Google Fonts est retiré : les woff2
    // sont self-hostés + le CSS @font-face est injecté par next/font.
    <html lang={htmlLang} data-theme={theme} className={fontVariables}>
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
        {/* Banner cookie consent — CASL/GDPR friendly. Affiché 1x via
            cookie plio_consent. Pas de tracking, juste informatif. */}
        <CookieConsent />
      </body>
    </html>
  );
}
