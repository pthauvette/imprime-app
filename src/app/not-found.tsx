/**
 * Auto-migrated from Open Design HTML artifact `not-found.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "404 — Plio" };

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
                <div className="err-suggestions-label">★ Tu cherchais peut-être</div>
                <div className="err-suggestions-list">
                  <a href="/order/start" className="err-sugg-pill">Cartes de visite</a>
                  <a href="/order/start" className="err-sugg-pill">Flyers</a>
                  <a href="/orders" className="err-sugg-pill">Mes commandes</a>
                  <a href="/samples" className="err-sugg-pill">Échantillons gratuits</a>
                  <a href="/wallet" className="err-sugg-pill">Portefeuille</a>
                  <a href="#" className="err-sugg-pill">FAQ</a>
                  <a href="#" className="err-sugg-pill">Templates</a>
                  <a href="#" className="err-sugg-pill">Contact support</a>
                </div>
              </div>
            </div>
      
            <div className="err-visual">
              <div className="err-404">4<em>0</em>4</div>
              <div className="err-compass"><div className="err-compass-dots"></div></div>
              <div className="lost-pkg lp-1">#SIN-99821<div className="lost-pkg-shipped">EGARÉ</div></div>
              <div className="lost-pkg lp-2">#SIN-87543<div className="lost-pkg-shipped">EGARÉ</div></div>
              <div className="lost-pkg lp-3">#SIN-65209<div className="lost-pkg-shipped">EGARÉ</div></div>
              <div className="lost-pkg lp-4">#SIN-42118<div className="lost-pkg-shipped">EGARÉ</div></div>
            </div>
          </main>
      
          <footer className="err-footer">
            <span className="err-footer-id">★ ERROR_ID: 404 · 2026-05-15T15:42:08Z · TRACE_X9F2H</span>
            <span>★ BONJOUR@PLIO.CA · © PLIO 2026 🇨🇦</span>
          </footer>
        </div>
    </>
  );
}
