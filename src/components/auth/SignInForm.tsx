'use client';

/**
 * Formulaire de connexion — magic link uniquement pour MVP. OAuth providers
 * (Google/Apple/GitHub) seront branchés quand on aura les credentials.
 */

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';

export default function SignInForm({ callbackUrl }: { callbackUrl?: string }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // signIn redirige vers /sign-in/sent (pages.verifyRequest dans auth.ts)
      await signIn('nodemailer', {
        email: email.trim().toLowerCase(),
        callbackUrl: callbackUrl ?? '/orders',
      });
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
            placeholder="patrick@democratik.org"
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
