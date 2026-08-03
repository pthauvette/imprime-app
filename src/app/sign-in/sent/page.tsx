/**
 * /sign-in/sent — page après l'envoi du magic link.
 *
 * Lit l'email depuis ?email=... pour afficher dynamiquement le destinataire.
 * Le SignInForm push manuellement cette URL avec l'email après avoir lancé
 * signIn() avec redirect: false (sinon Auth.js redirige nu vers /sign-in/sent
 * sans passer l'email).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: "Vérifie ta boîte courriel" };

export default async function MagicLinkSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const displayEmail = email && email.includes('@') ? email : 'ton adresse courriel';

  // Pre-compute the deep links to the most common email providers based on the
  // user's email domain — saves them a click.
  const providerDeepLinks = computeProviderLinks(email ?? null);

  return (
    <div className="ml-shell">
      <nav className="ml-nav">
        <Link href={'/' as Route} className="ml-nav-brand">Plio.</Link>
      </nav>

      <main className="ml-main">
        <div className="envelope-block">
          <span className="sparkle sp1">★</span>
          <span className="sparkle sp2">✦</span>
          <span className="sparkle sp3">✧</span>
          <span className="sparkle sp4">★</span>
          <div className="envelope">
            <div className="env-body">
              <div className="env-letter">
                <div className="env-letter-line"></div>
                <div className="env-letter-line"></div>
                <div className="env-letter-line"></div>
              </div>
              <div className="env-flap"></div>
            </div>
          </div>
        </div>

        <div className="ml-headline">
          <div className="ml-eyebrow">Lien magique envoyé</div>
          <h1 className="ml-title">Vérifie ta boîte <em>courriel.</em></h1>
          <p className="ml-text">
            On a envoyé un lien sécurisé à <span className="ml-email">{displayEmail}</span>
            {' '}— clique dessus pour te connecter, c'est tout.
          </p>
        </div>

        <div className="ml-card">
          <div className="ml-step-list">
            <div className="ml-step">
              <div className="ml-step-num">1</div>
              <div className="ml-step-text">
                <strong>Ouvre ton courriel</strong>
                <span>
                  Cherche un message de{' '}
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, padding: '1px 6px', background: 'var(--bg-sunken)', borderRadius: 3 } as React.CSSProperties}>
                    bonjour@plio.ca
                  </code>{' '}
                  avec sujet « ✱ Ton lien de connexion Plio ».
                </span>
              </div>
            </div>
            <div className="ml-step">
              <div className="ml-step-num">2</div>
              <div className="ml-step-text">
                <strong>Clique sur le bouton « Se connecter »</strong>
                <span>
                  Le lien est valide pendant{' '}
                  <strong style={{ color: 'var(--accent-primary)' } as React.CSSProperties}>24 heures</strong>{' '}
                  et fonctionne une seule fois.
                </span>
              </div>
            </div>
            <div className="ml-step">
              <div className="ml-step-num">3</div>
              <div className="ml-step-text">
                <strong>Tu seras connecté automatiquement</strong>
                <span>Pas besoin de revenir ici — ton dashboard s'ouvre directement.</span>
              </div>
            </div>
          </div>

          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '0 0 8px' } as React.CSSProperties}>
              <Icon name="star" size={12} /> Ouvrir directement
            </p>
            <div className="ml-providers">
              {providerDeepLinks.map((p) => (
                <a key={p.name} href={p.url} target="_blank" rel="noopener noreferrer" className="ml-provider">
                  <div className="ml-provider-icon">{p.icon}</div>
                  <div className="ml-provider-name">{p.name}</div>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="ml-resend">
          <p>
            Pas reçu ?{' '}
            <strong style={{ color: 'var(--text-secondary)' } as React.CSSProperties}>
              Vérifie ton dossier spam
            </strong>
            {' '}— les magic links peuvent y tomber quand le domaine est récent.
          </p>
          <div className="ml-resend-row">
            {/* Round 6 #5 — propage l'email pour que /sign-in le pré-remplisse
                (le bouton « Renvoyer » repartait vers un formulaire vierge → on
                devait retaper son adresse). */}
            <Link
              href={(email && email.includes('@') ? `/sign-in?email=${encodeURIComponent(email)}` : '/sign-in') as Route}
              className="ml-resend-btn"
            >
              Renvoyer un lien
            </Link>
          </div>
        </div>

        <div className="ml-security">
          <span>
            <strong>Pourquoi un lien magique ?</strong> Plus sécurisé qu'un mot de passe
            (rien à mémoriser, rien à voler), plus rapide qu'un SMS, et confirme que c'est bien ton adresse courriel.
          </span>
        </div>

        <div className="ml-back">
          Mauvaise adresse courriel ?{' '}
          <Link href={'/sign-in' as Route}>← Recommencer</Link>
        </div>
      </main>

      <footer className="ml-footer">
        <span><Icon name="star" size={12} /> BONJOUR@PLIO.CA</span>
        <span><Icon name="star" size={12} /> © PLIO 2026 🇨🇦</span>
      </footer>
    </div>
  );
}

// Deep-link helpers : detect provider from email domain and prefill the
// search in their webmail. Saves the user from manually browsing inbox.
function computeProviderLinks(email: string | null): { name: string; icon: string; url: string }[] {
  const subject = encodeURIComponent('Ton lien de connexion Plio');
  const domain = email?.split('@')[1]?.toLowerCase() ?? '';

  // Suggested: their actual provider FIRST, then 2 fallbacks
  const all = [
    { match: /^(gmail|googlemail)\./, name: 'Gmail',   icon: '📧', url: `https://mail.google.com/mail/u/0/#search/from%3Abonjour%40plio.ca` },
    { match: /^(outlook|hotmail|live|msn)\./, name: 'Outlook', icon: '📨', url: `https://outlook.live.com/mail/0/inbox` },
    { match: /^(proton|protonmail|pm)\./, name: 'ProtonMail', icon: '🔐', url: `https://mail.proton.me/u/0/inbox` },
    { match: /^(yahoo|ymail|rocketmail)\./, name: 'Yahoo', icon: '🟪', url: `https://mail.yahoo.com/d/search/keyword=${subject}` },
    { match: /^(icloud|me|mac)\./, name: 'iCloud', icon: '☁️', url: `https://www.icloud.com/mail/` },
  ];
  const matched = all.find((p) => p.match.test(domain));
  if (matched) {
    return [
      matched,
      ...all.filter((p) => p !== matched).slice(0, 2),
    ];
  }
  // No match → show top 3 most common
  return all.slice(0, 3);
}
