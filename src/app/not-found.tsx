/**
 * not-found.tsx — page 404 globale (Next.js convention).
 */

import { Icon } from '@/components/ui/Icon';

export const metadata = { title: "404" };

export default function NotFound() {
  return (
    <>
      <div className="err-shell">
          <nav className="err-nav">
            <a href="/" className="err-nav-brand">Plio.</a>
          </nav>
      
          <main className="err-main">
            <div className="err-content">
              <div className="err-eyebrow">Erreur 404 · page introuvable</div>
              <h1 className="err-headline">Cette page s'est <em>perdue</em> en transit.</h1>
              <p className="err-text">L'URL que tu cherches n'existe pas, ou a été déplacée. Pas d'inquiétude — on a une presse, pas une boussole.</p>
      
              <div className="err-actions">
                <a href="/" className="err-btn-primary">← Retour à l'accueil</a>
                <a href="/order/start" className="err-btn-secondary">Démarrer un devis →</a>
              </div>
      
              <div className="err-suggestions">
                <div className="err-suggestions-label"><Icon name="star" size={14} /> Tu cherchais peut-être</div>
                <div className="err-suggestions-list">
                  <a href="/order/start" className="err-sugg-pill">Cartes de visite</a>
                  <a href="/order/start" className="err-sugg-pill">Flyers</a>
                  <a href="/orders" className="err-sugg-pill">Mes commandes</a>
                  <a href="/wallet" className="err-sugg-pill">Portefeuille</a>
                  <a href="/help" className="err-sugg-pill">FAQ</a>
                  <a href="/templates" className="err-sugg-pill">Templates</a>
                  <a href="/contact" className="err-sugg-pill">Contact support</a>
                </div>
              </div>
            </div>
      
            <div className="err-visual">
              <div className="err-404">4<em>0</em>4</div>
              <div className="err-compass"><div className="err-compass-dots"></div></div>
              <div className="lost-pkg lp-1">#99821<div className="lost-pkg-shipped">EGARÉ</div></div>
              <div className="lost-pkg lp-2">#87543<div className="lost-pkg-shipped">EGARÉ</div></div>
              <div className="lost-pkg lp-3">#65209<div className="lost-pkg-shipped">EGARÉ</div></div>
              <div className="lost-pkg lp-4">#42118<div className="lost-pkg-shipped">EGARÉ</div></div>
            </div>
          </main>
      
          <footer className="err-footer">
            <span className="err-footer-id"><Icon name="star" size={12} /> ERROR_ID: 404 · 2026-05-15T15:42:08Z · TRACE_X9F2H</span>
            <span><Icon name="star" size={12} /> BONJOUR@PLIO.CA · © PLIO 2026 🇨🇦</span>
          </footer>
        </div>
    </>
  );
}
