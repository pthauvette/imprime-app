'use client';

/**
 * Formulaire de connexion — magic link uniquement pour MVP. OAuth providers
 * (Google/Apple/GitHub) seront branchés quand on aura les credentials.
 *
 * On call signIn() avec redirect: false pour intercepter le résultat et
 * router.push() vers /sign-in/sent?email=xxx — sans ça, Auth.js redirige
 * nu vers /sign-in/sent et la page ne sait pas quel email afficher.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';

export default function SignInForm({
  callbackUrl,
  initialEmail,
}: {
  callbackUrl?: string;
  /** Pré-rempli depuis ?email= (flow « Renvoyer un lien » — évite de retaper). */
  initialEmail?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn('nodemailer', {
        email: cleanEmail,
        callbackUrl: callbackUrl ?? '/orders',
        redirect: false,
      });

      // signIn() avec redirect:false retourne un objet { error?, ok?, url? }.
      // On manually navigate vers /sign-in/sent avec l'email en query param.
      if (result?.error) {
        throw new Error(decodeAuthError(result.error));
      }
      // Navigate via window pour s'assurer que la page recharge avec le query
      // param visible (Server Component lira searchParams.email)
      window.location.href = `/sign-in/sent?email=${encodeURIComponent(cleanEmail)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
      <div className="field-stack">
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            placeholder="ton@adresse.ca"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

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
        >
          {error}
        </div>
      )}

      <button type="submit" className="magic-link-cta" disabled={submitting}>
        <div className="magic-icon">{submitting ? '⏳' : '✱'}</div>
        <div className="magic-text">
          <strong>
            {submitting ? 'Envoi du lien…' : 'Recevoir un lien magique par courriel'}
          </strong>
          <span>Pas de mot de passe à retenir — recommandé</span>
        </div>
      </button>

      <div className="auth-footer" style={{ marginTop: 24 }}>
        🔒 Authentification sécurisée · Connexion sans mot de passe
      </div>
    </form>
  );
}

function decodeAuthError(code: string): string {
  // Auth.js v5 error codes — mappe les plus communs en français
  const map: Record<string, string> = {
    EmailSignin: 'Impossible d\'envoyer le lien magique. Vérifie ton email ou réessaie.',
    Configuration: 'Configuration serveur invalide. Contacte le support.',
    Default: 'Erreur lors de la connexion. Réessaie dans un instant.',
  };
  return map[code] ?? `Erreur: ${code}`;
}
