'use client';

/**
 * Form de capture newsletter. À placer dans le footer landing (ou modal
 * popup plus tard si on veut être plus aggressif sur la conversion).
 *
 * CASL-compliant : consentement EXPRESS via la coche obligatoire avant
 * submit. Pas d'auto-tick. Wording clair sur ce qu'on envoie + fréquence.
 *
 * Source passé en prop pour tracker conversion par placement (landing-
 * footer, popup-exit, pricing-cta, etc.).
 */

import { useState } from 'react';
import FormError from '@/components/forms/FormError';
import { Icon } from '@/components/ui/Icon';

export default function NewsletterSignup({ source = 'landing-footer' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@') || !consent || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{ padding: '16px 20px', background: 'var(--success-soft, #f0fdf4)', border: '1px solid var(--success, #16a34a)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
        <Icon name="check" size={14} /> <strong>Merci !</strong> Tu vas recevoir une confirmation par email. Si tu as commandé sans avoir reçu cet email, vérifie tes spams.
      </div>
    );
  }

  const canSubmit = email.includes('@') && consent && !submitting;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
      <h4 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text-primary)', fontWeight: 400 }}>
        Reste au courant
      </h4>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        1 email par mois max — nouveautés produit, promos limitées, conseils pré-presse. Pas de spam, désabonnement en 1 click.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-label="Ton adresse courriel pour l'infolettre"
          placeholder="ton@email.ca"
          autoComplete="email"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--bg-canvas)' }}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '8px 16px',
            background: canSubmit ? 'var(--accent-primary)' : 'var(--bg-sunken)',
            color: canSubmit ? 'white' : 'var(--text-muted)',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
          }}
        >
          {submitting ? '…' : "S'abonner"}
        </button>
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          required
          style={{ marginTop: 2, flexShrink: 0 }}
        />
        <span>
          J&apos;accepte de recevoir des communications marketing de Plio (Démocratik inc.) à cette adresse. Je peux me désabonner à tout moment depuis le lien dans chaque email. <a href="/legal/privacy" style={{ color: 'var(--accent-primary)' }}>Politique de confidentialité</a>.
        </span>
      </label>
      {/* Audit v2 #9.2 — erreur annoncée aux lecteurs d'écran (role=alert). */}
      <FormError>{error}</FormError>
    </form>
  );
}
