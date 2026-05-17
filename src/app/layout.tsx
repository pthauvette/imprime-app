import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';

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
    languages: { 'fr-CA': APP_URL },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_CA',
    url: APP_URL,
    siteName: SITE_NAME,
    title: `Plio — ${TAGLINE}`,
    description: DESCRIPTION,
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'Plio — print wholesale au Canada',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Plio — ${TAGLINE}`,
    description: DESCRIPTION,
    images: ['/og-default.png'],
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr-CA">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
