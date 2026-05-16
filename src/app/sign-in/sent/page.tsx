/**
 * Auto-migrated from Open Design HTML artifact `magic-link-sent.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Vérifie ta boîte courriel — Imprime" };

export default function MagicLinkSentPage() {
  return (
    <>
      <div className="ml-shell">
          <nav className="ml-nav">
            <a href="/" className="ml-nav-brand">Imprime.</a>
          </nav>
      
          <main className="ml-main">
            {/* Envelope animation */}
            <div className="envelope-block">
              <span className="sparkle sp1">★</span>
              <span className="sparkle sp2">✦</span>
              <span className="sparkle sp3">✧</span>
              <span className="sparkle sp4">★</span>
              <div className="envelope">
                <div className="env-body">
                  <div className="env-letter">
                    <div className="env-letter-line"></div>
                    <div className="env-letter-line"></div>
                    <div className="env-letter-line"></div>
                  </div>
                  <div className="env-flap"></div>
                </div>
              </div>
            </div>
      
            {/* Headline */}
            <div className="ml-headline">
              <div className="ml-eyebrow">Lien magique envoyé</div>
              <h1 className="ml-title">Vérifie ta boîte <em>courriel.</em></h1>
              <p className="ml-text">On a envoyé un lien sécurisé à <span className="ml-email">patrick@democratik.org</span> — clique dessus pour te connecter, c'est tout.</p>
            </div>
      
            {/* Steps card */}
            <div className="ml-card">
              <div className="ml-step-list">
                <div className="ml-step">
                  <div className="ml-step-num">1</div>
                  <div className="ml-step-text">
                    <strong>Ouvre ton courriel</strong>
                    <span>Cherche un message de <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", padding: "1px 6px", background: "var(--bg-sunken)", borderRadius: "3px" } as React.CSSProperties}>noreply@imprime.co</code> avec sujet « ✱ Ton lien magique Imprime ».</span>
                  </div>
                </div>
                <div className="ml-step">
                  <div className="ml-step-num">2</div>
                  <div className="ml-step-text">
                    <strong>Clique sur le bouton « Se connecter »</strong>
                    <span>Le lien est valide pendant <strong style={{ color: "var(--accent-primary)" } as React.CSSProperties}>15 minutes</strong> et fonctionne une seule fois.</span>
                  </div>
                </div>
                <div className="ml-step">
                  <div className="ml-step-num">3</div>
                  <div className="ml-step-text">
                    <strong>Tu seras connecté automatiquement</strong>
                    <span>Pas besoin de revenir ici — ton dashboard s'ouvre directement.</span>
                  </div>
                </div>
              </div>
      
              {/* Quick provider links */}
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600", margin: "0 0 8px" } as React.CSSProperties}>★ Ouvrir directement</p>
                <div className="ml-providers">
                  <a href="https://gmail.com" target="_blank" className="ml-provider">
                    <div className="ml-provider-icon">📧</div>
                    <div className="ml-provider-name">Gmail</div>
                  </a>
                  <a href="https://outlook.live.com" target="_blank" className="ml-provider">
                    <div className="ml-provider-icon">📨</div>
                    <div className="ml-provider-name">Outlook</div>
                  </a>
                  <a href="https://mail.proton.me" target="_blank" className="ml-provider">
                    <div className="ml-provider-icon">🔐</div>
                    <div className="ml-provider-name">ProtonMail</div>
                  </a>
                </div>
              </div>
            </div>
      
            {/* Resend */}
            <div className="ml-resend">
              <p>Pas reçu ? <a href="#" style={{ color: "var(--text-secondary)", textDecoration: "underline" } as React.CSSProperties}>Vérifie ton dossier spam</a> ou demande un nouveau lien.</p>
              <div className="ml-resend-row">
                <button className="ml-resend-btn disabled">Renvoyer</button>
                <span className="ml-countdown">Disponible dans <strong>00:42</strong></span>
              </div>
            </div>
      
            {/* Security hint */}
            <div className="ml-security">
              <span><strong>Pourquoi un lien magique ?</strong> Plus sécurisé qu'un mot de passe (rien à mémoriser, rien à voler), plus rapide qu'un SMS, et confirme que c'est bien ton adresse courriel.</span>
            </div>
      
            {/* Back link */}
            <div className="ml-back">
              Mauvaise adresse courriel ? <a href="/sign-in">← Recommencer</a>
            </div>
          </main>
      
          <footer className="ml-footer">
            <span>★ HELLO@IMPRIME.CO</span>
            <span>★ © IMPRIME 2026 🇨🇦</span>
          </footer>
        </div>
    </>
  );
}
