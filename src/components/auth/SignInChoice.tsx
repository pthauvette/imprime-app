'use client';

/**
 * Choix du moyen de connexion : lien par courriel ou code par texto.
 *
 * Le courriel reste PRÉSÉLECTIONNÉ — c'est le chemin recommandé (aucun coût
 * par envoi, fonctionne sans mobile, et c'est le seul dont dispose un compte
 * créé avant l'arrivée du texto). Le texto est une alternative offerte, pas
 * une bascule par défaut.
 *
 * L'onglet texto n'est rendu que si `smsDisponible` — la page le calcule côté
 * serveur. Afficher un moyen de connexion qui répondrait 404 serait pire que
 * de ne pas l'afficher du tout.
 */

import { useState } from 'react';
import SignInForm from './SignInForm';
import SignInSms from './SignInSms';

type Methode = 'courriel' | 'texto';

export default function SignInChoice({
  callbackUrl,
  initialEmail,
  smsDisponible,
}: {
  callbackUrl: string;
  initialEmail?: string;
  smsDisponible: boolean;
}) {
  const [methode, setMethode] = useState<Methode>('courriel');

  // Sans le texto, on rend le formulaire courriel seul : pas d'onglet unique,
  // qui suggérerait un choix inexistant.
  if (!smsDisponible) {
    return <SignInForm callbackUrl={callbackUrl} initialEmail={initialEmail} />;
  }

  const onglet = (m: Methode, libelle: string) => {
    const actif = methode === m;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={actif}
        onClick={() => setMethode(m)}
        style={{
          flex: 1,
          padding: '10px 12px',
          border: 'none',
          borderRadius: 'var(--r-md)',
          // L'état sélectionné n'est PAS porté par la seule couleur : le poids
          // de police et le fond changent aussi, pour rester lisible en
          // daltonisme comme en contraste élevé.
          background: actif ? 'var(--bg-canvas)' : 'transparent',
          color: actif ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontWeight: actif ? 600 : 500,
          fontSize: 13,
          cursor: 'pointer',
          boxShadow: actif ? 'var(--shadow-xs)' : 'none',
          transition: 'all var(--dur-fast) var(--ease-out)',
        }}
      >
        {libelle}
      </button>
    );
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Moyen de connexion"
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: 'var(--bg-sunken)',
          borderRadius: 'var(--r-lg)',
          marginBottom: 20,
        }}
      >
        {onglet('courriel', 'Lien par courriel')}
        {onglet('texto', 'Code par texto')}
      </div>

      {methode === 'courriel'
        ? <SignInForm callbackUrl={callbackUrl} initialEmail={initialEmail} />
        : <SignInSms callbackUrl={callbackUrl} />}
    </>
  );
}
