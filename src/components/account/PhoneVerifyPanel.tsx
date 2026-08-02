'use client';

/**
 * Vérification d'un numéro pour le compte CONNECTÉ — deux temps (numéro, code).
 *
 * Sert les deux emplacements prévus : le panneau de /settings, et l'étape
 * téléphone qui suit la première connexion (obligatoire). Une seule
 * implémentation, parce que c'est exactement la même opération : prouver un
 * numéro sur son propre compte (cf. /api/auth/sms/link).
 */

import { useState, useRef, useEffect, type FormEvent } from 'react';

export default function PhoneVerifyPanel({
  numeroActuel,
  onVerifie,
}: {
  /** Numéro déjà rattaché, MASQUÉ (le complet ne quitte jamais le serveur). */
  numeroActuel?: string | null;
  onVerifie?: (masque: string) => void;
}) {
  const [etape, setEtape] = useState<'numero' | 'code'>('numero');
  const [telephone, setTelephone] = useState('');
  const [masque, setMasque] = useState('');
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const champCode = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (etape === 'code') champCode.current?.focus();
  }, [etape]);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch('/api/auth/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: telephone }),
      });
      const data = (await res.json().catch(() => ({}))) as { masque?: string; error?: string };
      if (!res.ok) {
        // Le serveur formule déjà un message destiné au client (hors Canada,
        // débit dépassé, service indisponible) : on le relaie tel quel.
        setErreur(data.error ?? 'Impossible d’envoyer le code.');
        return;
      }
      setMasque(data.masque ?? '');
      setEtape('code');
    } catch {
      setErreur('Connexion impossible. Vérifie ton accès internet.');
    } finally {
      setEnCours(false);
    }
  }

  async function verifier(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch('/api/auth/sms/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: telephone, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { masque?: string; error?: string };
      if (!res.ok) {
        // Le 409 « numéro déjà rattaché à un autre compte » porte un message
        // spécifique et ACTIONNABLE : le relayer tel quel évite d'envoyer le
        // client tourner en rond sur « code invalide ».
        setErreur(data.error ?? 'Code invalide ou expiré.');
        return;
      }
      setSucces(data.masque ?? '');
      setEtape('numero');
      setTelephone('');
      setCode('');
      onVerifie?.(data.masque ?? '');
    } catch {
      setErreur('Connexion impossible. Réessaie dans un instant.');
    } finally {
      setEnCours(false);
    }
  }

  const numeroAffiche = succes ?? numeroActuel;

  return (
    <form onSubmit={etape === 'numero' ? envoyer : verifier} style={{ display: 'grid', gap: 12 }}>
      {numeroAffiche && !succes && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          Numéro vérifié : <strong>{numeroAffiche}</strong>
        </p>
      )}

      {succes && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            background: 'var(--success-soft)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: 'var(--success)',
          }}
        >
          Numéro vérifié : {succes}. Tu peux maintenant te connecter par texto.
        </div>
      )}

      {etape === 'numero' ? (
        <div className="field">
          <label htmlFor="tel-verif">
            {numeroAffiche ? 'Remplacer par un autre numéro' : 'Téléphone'}
          </label>
          <input
            id="tel-verif"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="514 555-0123"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            disabled={enCours}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
            Numéro canadien seulement. Sert à te connecter par texto.
          </span>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="code-verif">Code reçu par texto</label>
          <input
            id="code-verif"
            ref={champCode}
            type="text"
            inputMode="numeric"
            // Remplissage automatique depuis le SMS sur iOS et Android.
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={10}
            required
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            disabled={enCours}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
            Envoyé au {masque}.{' '}
            <button
              type="button"
              onClick={() => { setEtape('numero'); setCode(''); setErreur(null); }}
              style={{
                background: 'none', border: 'none', padding: 0,
                color: 'var(--accent-primary)', textDecoration: 'underline',
                cursor: 'pointer', font: 'inherit',
              }}
            >
              Changer de numéro
            </button>
          </span>
        </div>
      )}

      {erreur && (
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--r-md)',
            fontSize: 13,
            color: 'var(--danger)',
          }}
        >
          {erreur}
        </div>
      )}

      <div>
        <button type="submit" className="btn btn-primary" disabled={enCours}>
          {enCours
            ? (etape === 'numero' ? 'Envoi…' : 'Vérification…')
            : (etape === 'numero' ? 'Recevoir un code' : 'Vérifier le code')}
        </button>
      </div>
    </form>
  );
}
