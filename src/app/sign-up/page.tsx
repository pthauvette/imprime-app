/**
 * Auto-migrated from Open Design HTML artifact `signup.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Créer un compte — Imprime" };

export default function SignUpPage() {
  return (
    <>
      <div className="auth-shell">
          {/* Form side LEFT */}
          <main className="auth-form-side">
            <div className="auth-form">
              <a href="/" className="auth-form-brand">Imprime.</a>
              <a href="/" className="auth-back">← Retour</a>
      
              <h1>Crée ton compte, <em>imprime gratuitement.</em></h1>
              <p>2 minutes. Pas de carte de crédit. Premier devis offert.</p>
      
              {/* OAuth */}
              <div className="oauth-row">
                <button className="oauth-btn">G Google</button>
                <button className="oauth-btn">🍎 Apple</button>
                <button className="oauth-btn">⚡ GitHub</button>
              </div>
      
              <div className="auth-divider">ou avec ton email</div>
      
              {/* Fields */}
              <div className="field-stack">
                <div className="field-row">
                  <div className="field">
                    <label>Prénom</label>
                    <input type="text" value="Patrick" autoFocus />
                  </div>
                  <div className="field">
                    <label>Nom</label>
                    <input type="text" value="Thauvette" />
                  </div>
                </div>
                <div>
                  <div className="field">
                    <label>Email professionnel</label>
                    <input type="email" value="patrick@democratik.org" />
                  </div>
                  <div className="field-helper">★ Confirmation par lien magique — pas de mot de passe à retenir</div>
                </div>
                <div>
                  <div className="field">
                    <label>Entreprise (optionnel)</label>
                    <input type="text" value="Démocratik" />
                  </div>
                  <div className="field-helper">Active la facturation au nom de ton entreprise</div>
                </div>
              </div>
      
              {/* Terms */}
              <div className="terms-row">
                <span className="checkbox">✓</span>
                <span>J'accepte les <a href="#">conditions d'utilisation</a> et la <a href="#">politique de confidentialité</a> d'Imprime.</span>
              </div>
              <div className="terms-row" style={{ paddingTop: "0" } as React.CSSProperties}>
                <span className="checkbox unchecked"></span>
                <span>Recevoir l'infolettre mensuelle (nouveaux produits, conseils print, promotions exclusives).</span>
              </div>
      
              <button className="auth-submit">Créer mon compte gratuit →</button>
      
              <div className="auth-switch">
                Déjà un compte ? <a href="/sign-in">Se connecter</a>
              </div>
      
              <div className="auth-footer">
                🔒 Chiffré · 🇨🇦 Données hébergées au Canada · 0 spam
              </div>
            </div>
          </main>
      
          {/* Editorial side RIGHT */}
          <aside className="auth-side">
            <div className="side-eyebrow">Bonus de bienvenue</div>
            <div>
              <h2 className="side-headline">25 $ <em>offerts</em> sur ta première commande.</h2>
              <p style={{ fontSize: "16px", color: "var(--text-secondary)", lineHeight: "1.5", margin: "0 0 16px" } as React.CSSProperties}>Plus 5 échantillons gratuits, accès aux templates, et notre éditeur en ligne avec IA.</p>
      
              <div className="side-perks">
                <div className="side-perk">
                  <div className="side-perk-icon">★</div>
                  <div className="side-perk-text">
                    <strong>Devis instantané, illimité</strong>
                    <span>Configure n'importe quel produit, vois le prix exact en temps réel.</span>
                  </div>
                </div>
                <div className="side-perk">
                  <div className="side-perk-icon">📦</div>
                  <div className="side-perk-text">
                    <strong>5 échantillons par mois, gratuits</strong>
                    <span>Touche le papier avant de commander — envoyés en 5 jours.</span>
                  </div>
                </div>
                <div className="side-perk">
                  <div className="side-perk-icon">🎨</div>
                  <div className="side-perk-text">
                    <strong>Templates &amp; éditeur en ligne</strong>
                    <span>Pas de design ? On a des templates et un éditeur avec IA.</span>
                  </div>
                </div>
                <div className="side-perk">
                  <div className="side-perk-icon">🇨🇦</div>
                  <div className="side-perk-text">
                    <strong>100 % imprimé au Canada</strong>
                    <span>Livraison 1-7 jours via UPS et FedEx, partout au pays.</span>
                  </div>
                </div>
              </div>
            </div>
      
            <div className="side-mockup">
              <div className="pcm-name">Patrick Thauvette</div>
              <div className="pcm-divider"></div>
              <div className="pcm-title">Fondateur · Démocratik</div>
              <div className="pcm-meta">+1 514 555 0123 · democratik.org</div>
            </div>
      
            <div className="side-footer">
              <div className="side-footer-stat"><strong>12k+</strong>resellers</div>
              <div className="side-footer-stat"><strong>4,9 ★</strong>Trustpilot</div>
              <div className="side-footer-stat"><strong>2 min</strong>devis moyen</div>
            </div>
          </aside>
        </div>
    </>
  );
}
