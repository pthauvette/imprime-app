'use client';

/**
 * error.tsx — error boundary 500 GLOBALE (Round 43 #5).
 *
 * Avant : seul /order/* avait une boundary. Toute exception non-catchée
 * dans un Server Component hors /order/* tombait sur l'écran d'erreur par
 * défaut de Next.js (générique, hors design system). Maintenant cette
 * boundary attrape les 500 de toutes les pages sous le root layout.
 *
 * Réutilise les classes .err-* du not-found.tsx (404) pour un rendu soigné
 * et cohérent, dark-safe (tokens). Convention Next.js : 'use client' +
 * props { error, reset } ; reset() re-tente le rendu du segment.
 *
 * Note : ne couvre PAS les erreurs du root layout lui-même (il faudrait
 * global-error.tsx) — cas rare, root layout = quasi statique.
 */

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next.js + instrumentation.ts (onRequestError) ont déjà envoyé à
    // Sentry automatiquement — pas de re-log ici pour éviter le doublon.
  }, [error]);

  return (
    <div className="err-shell">
      <nav className="err-nav">
        <a href="/" className="err-nav-brand">Plio.</a>
      </nav>

      <main className="err-main">
        <div className="err-content">
          <div className="err-eyebrow">Erreur 500 · incident technique</div>
          <h1 className="err-headline">Quelque chose a <em>déraillé</em> de notre côté.</h1>
          <p className="err-text">
            Ce n&apos;est pas toi, c&apos;est nous. Notre équipe a été notifiée
            automatiquement. Réessaie dans un instant — souvent ça suffit.
          </p>

          <div className="err-actions">
            <button type="button" onClick={reset} className="err-btn-primary">
              ↻ Réessayer
            </button>
            <a href="/" className="err-btn-secondary">Retour à l&apos;accueil →</a>
          </div>

          <div className="err-suggestions">
            <div className="err-suggestions-label">★ Pendant ce temps</div>
            <div className="err-suggestions-list">
              <a href="/orders" className="err-sugg-pill">Mes commandes</a>
              <a href="/order/start" className="err-sugg-pill">Nouveau devis</a>
              <a href="/help" className="err-sugg-pill">FAQ</a>
              <a href="/contact" className="err-sugg-pill">Contact support</a>
            </div>
          </div>
        </div>

        <div className="err-visual">
          <div className="err-404">5<em>0</em>0</div>
          <div className="err-compass"><div className="err-compass-dots"></div></div>
          <div className="lost-pkg lp-1">#PRESSE<div className="lost-pkg-shipped">EN PANNE</div></div>
          <div className="lost-pkg lp-2">#SERVEUR<div className="lost-pkg-shipped">RETRY</div></div>
          <div className="lost-pkg lp-3">#ENCRE<div className="lost-pkg-shipped">À SEC</div></div>
          <div className="lost-pkg lp-4">#ROULEAU<div className="lost-pkg-shipped">COINCÉ</div></div>
        </div>
      </main>

      <footer className="err-footer">
        <span className="err-footer-id">
          ★ ERROR_ID: 500{error.digest ? ` · ${error.digest}` : ''}
        </span>
        <span>★ BONJOUR@PLIO.CA · © PLIO 2026 🇨🇦</span>
      </footer>
    </div>
  );
}
