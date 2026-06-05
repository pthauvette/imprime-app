'use client';

/**
 * SignUpForm — formulaire d'inscription. Magic-link uniquement comme
 * /sign-in, mais en plus on capture firstName / lastName / companyName
 * + opt-in marketing dans un cookie `plio_pending_profile` qui survit le
 * round-trip magic-link. Sur le 1er signIn (auth.ts events.signIn), si
 * isNewUser = true, on lit ce cookie pour populer le User row.
 *
 * Pas d'OAuth pour MVP (les buttons sont disabled avec un title — on les
 * activera quand on aura les credentials Google/Apple).
 */

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';

const PENDING_PROFILE_COOKIE = 'plio_pending_profile';
const COOKIE_MAX_AGE = 60 * 15; // 15 min — temps de cliquer le magic-link

export default function SignUpForm() {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Loi 25 — opt-in marketing AFFIRMATIF : case DÉCOCHÉE par défaut.
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !termsAccepted) return;
    setSubmitting(true);
    setError(null);
    try {
      // Pose le cookie avec les champs optionnels — Auth.js events.signIn
      // le lira sur le 1er sign-in pour populer firstName/lastName/companyName
      // (cf. src/auth.ts).
      const profile = {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        companyName: companyName.trim() || undefined,
        emailMarketing: marketingOptIn,
      };
      document.cookie = `${PENDING_PROFILE_COOKIE}=${encodeURIComponent(JSON.stringify(profile))}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;

      // #8.3 — marque cette inscription comme venant de la page promo
      // (« 25 $ offerts sur ta 1re commande »). Lu par auth.ts events.signIn :
      // seul ce flag accorde le code BIENVENUE (les comptes créés autrement —
      // ex. checkout invité — n'y ont pas droit). Survit jusqu'au clic du
      // magic-link (24 h).
      document.cookie = `plio_welcome=1; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;

      const result = await signIn('nodemailer', {
        email: cleanEmail,
        callbackUrl: '/account',
        redirect: false,
      });
      if (result?.error) {
        throw new Error(decodeAuthError(result.error));
      }
      window.location.href = `/sign-in/sent?email=${encodeURIComponent(cleanEmail)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
      {/* OAuth (placeholder — pas branché) */}
      <div className="oauth-row" aria-hidden="true">
        <button type="button" disabled className="oauth-btn" title="Bientôt disponible">G Google</button>
        <button type="button" disabled className="oauth-btn" title="Bientôt disponible">🍎 Apple</button>
        <button type="button" disabled className="oauth-btn" title="Bientôt disponible">⚡ GitHub</button>
      </div>

      <div className="auth-divider">avec ton email</div>

      <div className="field-stack">
        <div className="field-row">
          <div className="field">
            <label htmlFor="su-firstName">Prénom <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
            <input
              id="su-firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="field">
            <label htmlFor="su-lastName">Nom <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
            <input
              id="su-lastName"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>
        <div>
          <div className="field">
            <label htmlFor="su-email">Email professionnel</label>
            <input
              id="su-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="ton@adresse.ca"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="field-helper">★ Confirmation par lien magique — pas de mot de passe à retenir</div>
        </div>
        <div>
          <div className="field">
            <label htmlFor="su-company">Entreprise <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
            <input
              id="su-company"
              type="text"
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="field-helper">Active la facturation au nom de ton entreprise</div>
        </div>
      </div>

      <label className="terms-row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          required
          style={{ marginRight: 8 }}
        />
        <span>
          J&apos;accepte les{' '}
          <a href="/legal/terms" target="_blank" rel="noreferrer">conditions d&apos;utilisation</a>{' '}
          et la{' '}
          <a href="/legal/privacy" target="_blank" rel="noreferrer">politique de confidentialité</a>{' '}
          de Plio.
        </span>
      </label>

      <label className="terms-row" style={{ cursor: 'pointer', paddingTop: 0 }}>
        <input
          type="checkbox"
          checked={marketingOptIn}
          onChange={(e) => setMarketingOptIn(e.target.checked)}
          style={{ marginRight: 8 }}
        />
        <span>Recevoir l&apos;infolettre mensuelle (nouveaux produits, conseils print, promotions exclusives).</span>
      </label>

      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: 'var(--danger)',
            margin: '12px 0',
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        className="auth-submit"
        disabled={submitting || !termsAccepted || email.trim().length === 0}
      >
        {submitting ? 'Envoi du lien…' : 'Créer mon compte (lien magique) →'}
      </button>

      <div className="auth-switch">
        Déjà un compte ? <a href="/sign-in">Se connecter</a>
      </div>

      <div className="auth-footer">
        🔒 Chiffré · 🇨🇦 Données hébergées au Canada · 0 spam
      </div>
    </form>
  );
}

function decodeAuthError(code: string): string {
  const map: Record<string, string> = {
    EmailSignin: "Impossible d'envoyer le lien magique. Vérifie ton email ou réessaie.",
    Configuration: 'Configuration serveur invalide. Contacte le support.',
    Default: 'Erreur lors de la connexion. Réessaie dans un instant.',
  };
  return map[code] ?? `Erreur: ${code}`;
}
