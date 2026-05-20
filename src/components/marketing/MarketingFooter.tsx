/**
 * MarketingFooter — footer partagé pour les pages marketing/legal.
 *
 * Avant ce composant : duplicate dans /contact + /legal/refund-policy
 * (+ partiellement /legal/terms, /legal/privacy). Round 16 #3 extrait
 * le markup commun pour éviter la dérive.
 *
 * Pure Server Component (pas de hooks, pas d'interaction).
 */

export default function MarketingFooter() {
  return (
    <footer>
      <div className="footer-grid">
        <div className="footer-brand">
          <span className="footer-brand-mark">Plio.</span>
          <p className="footer-brand-text">
            Print wholesale au Canada, devis instantané, livraison partout en 1 à 7 jours.
            Imprimé à Markham (ON).
          </p>
        </div>
        <div className="footer-col">
          <h4>Entreprise</h4>
          <ul>
            <li><a href="/about">Notre histoire</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/blog">Blog</a></li>
            <li><a href="/reseller">Programme reseller</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Aide</h4>
          <ul>
            <li><a href="/help">Centre d&apos;aide</a></li>
            <li><a href="/contact">Contact</a></li>
            <li><a href="/samples">Échantillons gratuits</a></li>
            <li><a href="/status">Statut système</a></li>
          </ul>
        </div>
        <div className="footer-col">
          <h4>Légal</h4>
          <ul>
            <li><a href="/legal/terms">Conditions d&apos;utilisation</a></li>
            <li><a href="/legal/privacy">Confidentialité</a></li>
            <li><a href="/legal/refund-policy">Remboursements</a></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>★ © Plio 2026 · Imprimé au Canada 🇨🇦</span>
        <span>Démocratik inc. · Montréal</span>
      </div>
    </footer>
  );
}
