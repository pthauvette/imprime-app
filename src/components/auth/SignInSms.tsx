'use client';

/**
 * Connexion par code SMS — parcours en deux temps (numéro, puis code).
 *
 * Rendu UNIQUEMENT quand la fonctionnalité est configurée : la page vérifie
 * `smsAuthDisponible()` côté serveur et n'affiche pas l'onglet sinon. Proposer
 * un moyen de connexion qui répond 404 serait pire que de ne pas le proposer.
 *
 * Le lien magique reste le chemin RECOMMANDÉ : il n'a pas de coût par envoi et
 * fonctionne sans mobile. Le texto est une alternative, pas un remplacement.
 */

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';

type Etape = 'numero' | 'code';

export default function SignInSms({ callbackUrl }: { callbackUrl: string }) {
  const [etape, setEtape] = useState<Etape>('numero');
  const [telephone, setTelephone] = useState('');
  const [masque, setMasque] = useState('');
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champCode = useRef<HTMLInputElement>(null);

  // Le focus suit l'étape : sans ça, l'utilisateur doit re-viser le champ à la
  // souris après l'envoi, et un lecteur d'écran n'annonce pas le changement.
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
        // Le serveur renvoie déjà un message destiné au client (numéro hors
        // Canada, débit dépassé, service indisponible) : on le relaie tel quel
        // plutôt que d'en inventer un moins précis.
        setErreur(data.error ?? 'Impossible d’envoyer le code. Réessaie dans un instant.');
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
      const res = await signIn('sms', { phone: telephone, code, redirect: false, callbackUrl });
      if (res?.error) {
        // Message VOLONTAIREMENT identique quel que soit l'échec réel (code
        // erroné, expiré, ou numéro sans compte) : distinguer ces cas
        // transformerait l'écran en test « ce numéro a-t-il un compte ? ».
        setErreur('Code invalide ou expiré. Vérifie les chiffres, ou demande un nouveau code.');
        return;
      }
      window.location.href = res?.url ?? callbackUrl;
    } catch {
      setErreur('Connexion impossible. Réessaie dans un instant.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={etape === 'numero' ? envoyer : verifier} style={{ display: 'contents' }}>
      <div className="field-stack">
        {etape === 'numero' ? (
          <div className="field">
            <label htmlFor="tel">Téléphone</label>
            <input
              id="tel"
              type="tel"
              inputMode="tel"
              // `autoComplete` laisse le navigateur/OS proposer le numéro
              // enregistré — un chiffre mal saisi coûte un SMS facturé.
              autoComplete="tel"
              required
              autoFocus
              placeholder="514 555-0123"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              disabled={enCours}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, display: 'block' }}>
              Numéro canadien seulement.
            </span>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="code">Code reçu par texto</label>
            <input
              id="code"
              ref={champCode}
              type="text"
              inputMode="numeric"
              // `one-time-code` permet le remplissage automatique depuis le SMS
              // sur iOS et Android — c'est ce qui rend le parcours supportable
              // au doigt.
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
      </div>

      {erreur && (
        <div
          role="alert"
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
          {erreur}
        </div>
      )}

      <button type="submit" className="magic-link-cta" disabled={enCours}>
        <div className="magic-icon">{enCours ? '⏳' : '✆'}</div>
        <div className="magic-text">
          <strong>
            {enCours
              ? (etape === 'numero' ? 'Envoi du code…' : 'Vérification…')
              : (etape === 'numero' ? 'Recevoir un code par texto' : 'Me connecter')}
          </strong>
          <span>
            {etape === 'numero'
              ? 'Un code à usage unique, valide quelques minutes'
              : 'Entre les chiffres reçus par message'}
          </span>
        </div>
      </button>
    </form>
  );
}
