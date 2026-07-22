/**
 * /newsletter/unsubscribe?email=X&token=Y
 *
 * Page publique (no-auth) de désinscription pour newsletter + broadcasts.
 * Server Component qui :
 *   - Verifie le token HMAC
 *   - Affiche un Plio-branded form avec l'email préfilled
 *   - Bouton "Confirmer le désabonnement" → Client Component qui POST
 *
 * Pourquoi pas un GET auto-trigger ? Certains MUA (Gmail / Outlook) pre-fetch
 * les liens pour scanning de sécurité — ça déclenchait des unsubscribes
 * non-souhaités. Best practice CASL : confirmation explicite côté UI.
 *
 * Backward-compat : l'ancien endpoint GET /api/newsletter/unsubscribe reste
 * fonctionnel (auto-unsubscribe instantané) pour les emails déjà envoyés.
 * Les nouveaux emails pointent vers cette page.
 */

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { newsletterUnsubscribeToken } from '@/lib/newsletter/token';
import UnsubscribeForm from './UnsubscribeForm';
import { Icon } from '@/components/ui/Icon';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Désabonnement',
  // robots noindex — pas dans les SERP, c'est juste un endpoint
  robots: { index: false, follow: false },
};

interface SP {
  email?: string;
  token?: string;
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const email = sp.email?.trim().toLowerCase();
  const token = sp.token;

  if (!email || !token) {
    return <ErrorPage reason="Lien incomplet. Reçois ton lien via un email Plio." />;
  }

  if (token !== newsletterUnsubscribeToken(email)) {
    return <ErrorPage reason="Lien invalide ou expiré. Si tu veux te désabonner, écris-nous à bonjour@plio.ca." />;
  }

  // Check current status — peut déjà être unsubscribed (idempotent)
  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { email },
    select: { status: true },
  });

  if (subscriber?.status === 'UNSUBSCRIBED') {
    return (
      <Layout>
        <h1 style={titleStyle}>Déjà désabonné</h1>
        <p style={paragraphStyle}>
          L&apos;adresse <strong>{email}</strong> ne reçoit déjà plus nos communications
          marketing. Tu peux fermer cette page.
        </p>
        <p style={paragraphStyle}>
          Tu continueras à recevoir les emails transactionnels (confirmation de commande,
          suivi de livraison) si tu commandes — ces emails sont essentiels au service.
        </p>
      </Layout>
    );
  }

  // Server Action pas dispo en RSC simple, on délègue à un Client component
  return (
    <Layout>
      <h1 style={titleStyle}>Désabonnement</h1>
      <p style={paragraphStyle}>
        Tu es sur le point de te désabonner des communications marketing de Plio
        envoyées à <strong>{email}</strong>.
      </p>
      <p style={{ ...paragraphStyle, fontSize: 13 }}>
        <Icon name="alert" size={14} /> Tu continueras à recevoir les emails transactionnels (confirmation, suivi
        de livraison) si tu commandes — ces emails sont essentiels au service et ne
        sont pas concernés par le désabonnement marketing.
      </p>
      <UnsubscribeForm email={email} token={token} />
    </Layout>
  );
}

function ErrorPage({ reason }: { reason: string }) {
  return (
    <Layout>
      <h1 style={titleStyle}>Désabonnement impossible</h1>
      <p style={paragraphStyle}>{reason}</p>
      <p style={paragraphStyle}>
        Si le problème persiste, écris-nous à{' '}
        <a href="mailto:bonjour@plio.ca" style={{ color: '#1F3D2B', fontWeight: 600 }}>
          bonjour@plio.ca
        </a>{' '}
        et on s&apos;occupe de ton désabonnement manuellement.
      </p>
    </Layout>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: '80px auto',
        padding: '40px 32px',
        background: '#FFFFFF',
        border: '1px solid #ECEAE3',
        borderRadius: 12,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#141C16',
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 32,
          color: '#1F3D2B',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          marginBottom: 24,
        }}
      >
        Plio.
      </div>
      {children}
      <div
        style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: '1px solid #ECEAE3',
          fontSize: 11,
          color: '#7A8780',
          lineHeight: 1.5,
        }}
      >
        Démocratik inc. · Montréal, QC, Canada · Conforme à la <a href="https://laws-lois.justice.gc.ca/eng/acts/E-1.6/" style={{ color: '#7A8780' }}>LCAP (CASL)</a>
      </div>
    </main>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: 28,
  color: '#1F3D2B',
  margin: '0 0 16px',
  fontWeight: 400,
  letterSpacing: '-0.02em',
};

const paragraphStyle: React.CSSProperties = {
  fontSize: 15,
  color: '#4A554D',
  margin: '0 0 16px',
};
