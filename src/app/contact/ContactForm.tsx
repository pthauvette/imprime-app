'use client';

/**
 * Formulaire de contact public — POST /api/contact.
 *
 * Layout reuse les classes `.form-card` / `.field-grid` / `.field-row` etc.
 * du design existant (auto-migrated depuis Open Design), juste avec state +
 * handler ajoutés.
 *
 * File upload retiré du MVP — pas critique, on peut demander au client
 * d'inclure le lien dans le message.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { SUPPORT_SLA } from '@/lib/content/marketing';
import FormError from '@/components/forms/FormError';

const SUBJECTS = [
  'Question avant achat',
  'Problème avec ma commande',
  'Devis sur mesure (volume / spécialité)',
  'Partenariat / Reseller',
  'Presse / Médias',
  'Loi 25 — accès / suppression de mes données',
  'Autre',
] as const;

export default function ContactForm() {
  const sp = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState<string>(SUBJECTS[0]);
  const [message, setMessage] = useState('');

  // Round 18 #3 — prefil depuis /help search no-result CTA.
  // ?subject=Q: foo → message body prefilled, subject reste sur "Question
  // avant achat" (catégorie admin la plus pertinente pour FAQ-driven).
  useEffect(() => {
    const querySubject = sp.get('subject');
    if (querySubject && message === '') {
      setMessage(`${querySubject}\n\n`);
    }
  }, [sp, message]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    email.includes('@') &&
    message.trim().length >= 10 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject,
          message: message.trim(),
        }),
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
      <div className="form-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
        <h2 style={{ marginBottom: 8 }}>Message envoyé.</h2>
        <p>On te répond en {SUPPORT_SLA} (Lun–Ven · 9h–18h ET).</p>
        <p style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
          Tu vas recevoir une copie à <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <h2>Écris-nous un mot</h2>
      <p className="form-intro">Plus tu nous donnes de contexte, plus on peut être utile dès la première réponse.</p>

      <div className="field-grid">
        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Nom complet</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sophie Beauchamp" required maxLength={150} autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="email">Courriel</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="sophie@studio.ca" required maxLength={150} autoComplete="email" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="subject">Sujet</label>
          <select id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="field">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            placeholder="Donne-nous tous les détails — numéro de commande, lien de fichier, captures d'écran si pertinent..."
            required
          />
        </div>
      </div>

      <FormError style={{ marginTop: 12, padding: '10px 14px', background: 'var(--danger-soft)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', fontSize: 13 }}>
        {error}
      </FormError>

      <div className="form-submit-row">
        <div className="small">En soumettant, tu acceptes notre <a href="/legal/privacy" style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}>politique de confidentialité</a>.</div>
        <button className="submit-btn" type="submit" disabled={!canSubmit} style={{ opacity: canSubmit ? 1 : 0.5 }}>
          {submitting ? 'Envoi…' : 'Envoyer →'}
        </button>
      </div>
    </form>
  );
}
