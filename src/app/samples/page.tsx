/**
 * Auto-migrated from Open Design HTML artifact `samples.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Échantillons — Plio" };

export default function SamplesPage() {
  return (
    <>
      <div className="acct-shell">
          <aside className="acct-nav">
            <div className="acct-nav-brand">Plio.</div>
            <div className="acct-nav-section">Compte</div>
            <ul className="acct-nav-list">
              <li><a href="/orders" className="acct-nav-link">Mes commandes <span className="count">12</span></a></li>
              <li><a href="#" className="acct-nav-link">Brouillons <span className="count">3</span></a></li>
              <li><a href="#" className="acct-nav-link">Adresses</a></li>
              <li><a href="/wallet" className="acct-nav-link">Portefeuille</a></li>
              <li><a href="#" className="acct-nav-link">Paiements</a></li>
              <li><a href="#" className="acct-nav-link">Codes promo</a></li>
            </ul>
            <div className="acct-nav-section">Outils</div>
            <ul className="acct-nav-list">
              <li><a href="/order/start" className="acct-nav-link">+ Nouvelle commande</a></li>
              <li><a href="/samples" className="acct-nav-link active">Demander un échantillon</a></li>
              <li><a href="#" className="acct-nav-link">Templates &amp; guides</a></li>
              <li><a href="#" className="acct-nav-link">Devenir reseller</a></li>
            </ul>
            <div className="acct-nav-section">Support</div>
            <ul className="acct-nav-list">
              <li><a href="#" className="acct-nav-link">Aide &amp; FAQ</a></li>
              <li><a href="#" className="acct-nav-link">Contact</a></li>
            </ul>
          </aside>
      
          <main className="samples-main">
            <div className="page-eyebrow">Échantillons gratuits</div>
            <h1 className="page-title">Touche, regarde, <em>compare.</em></h1>
            <p className="page-lede">Reçois jusqu'à <strong style={{ color: "var(--text-primary)" } as React.CSSProperties}>5 échantillons physiques par mois</strong> — gratuits, sans engagement, livrés en 5 jours par Postes Canada.</p>
      
            <div className="sample-counter">
              <strong>3</strong>
              <span>sélectionnés sur 5 disponibles ce mois-ci</span>
            </div>
      
            {/* Papiers */}
            <div className="section-header">
              <h2 className="section-header-title">Papiers</h2>
              <span className="section-header-meta">9 stocks disponibles</span>
            </div>
            <div className="sample-grid">
              <div className="sample-card selected">
                <div className="sample-swatch coated14">
                  <span className="sample-swatch-tag">Bestseller</span>
                  <span className="sample-swatch-corner">350 GSM</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">14pt Coated</div>
                  <div className="sample-desc">Le standard. Surface lisse, durable, excellent rendu CMYK.</div>
                  <div className="sample-spec">14pt · 350 g/m² · couché brillant</div>
                </div>
              </div>
              <div className="sample-card selected">
                <div className="sample-swatch coated16">
                  <span className="sample-swatch-corner">400 GSM</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">16pt Coated</div>
                  <div className="sample-desc">Plus épais que le standard. Meilleur ressenti premium.</div>
                  <div className="sample-spec">16pt · 400 g/m² · couché brillant</div>
                </div>
              </div>
              <div className="sample-card selected">
                <div className="sample-swatch soft">
                  <span className="sample-swatch-tag">★ Coup de cœur</span>
                  <span className="sample-swatch-corner">450 GSM</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">18pt Soft Touch</div>
                  <div className="sample-desc">Sensation veloutée unique. L'option signature.</div>
                  <div className="sample-spec">18pt · 450 g/m² · soft touch lamination</div>
                </div>
              </div>
              <div className="sample-card">
                <div className="sample-swatch matte">
                  <span className="sample-swatch-corner">350 GSM</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">14pt Matte Finish</div>
                  <div className="sample-desc">Finition mate sans reflet. Idéal pour la photo sombre.</div>
                  <div className="sample-spec">14pt · 350 g/m² · finition mate</div>
                </div>
              </div>
              <div className="sample-card">
                <div className="sample-swatch kraft">
                  <span className="sample-swatch-tag">Eco</span>
                  <span className="sample-swatch-corner" style={{ background: "rgba(245,241,232,0.85)" } as React.CSSProperties}>300 GSM</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">Kraft naturel</div>
                  <div className="sample-desc">Papier recyclé brun. Esthétique artisanale, engagement écologique.</div>
                  <div className="sample-spec">300 g/m² · 100 % recyclé · non couché</div>
                </div>
              </div>
              <div className="sample-card">
                <div className="sample-swatch linen">
                  <span className="sample-swatch-corner">320 GSM</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">Linen (texture lin)</div>
                  <div className="sample-desc">Texture tissée. Donne une sensation tactile distinctive.</div>
                  <div className="sample-spec">320 g/m² · texture lin gaufré</div>
                </div>
              </div>
            </div>
      
            {/* Finitions */}
            <div className="section-header">
              <h2 className="section-header-title">Finitions spéciales</h2>
              <span className="section-header-meta">5 effets disponibles</span>
            </div>
            <div className="sample-grid">
              <div className="sample-card">
                <div className="sample-swatch uv">
                  <span className="sample-swatch-tag">Bestseller</span>
                  <span className="sample-swatch-corner">UV</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">UV High Gloss</div>
                  <div className="sample-desc">Brillant éclatant, couleurs saturées. Notre finition la plus vendue.</div>
                  <div className="sample-spec">Coating UV haute brillance · pleine surface</div>
                </div>
              </div>
              <div className="sample-card">
                <div className="sample-swatch spotuv">
                  <span className="sample-swatch-corner">SPOT</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">Spot UV</div>
                  <div className="sample-desc">Vernis sélectif sur zones précises (logo, typo). Effet contraste mat/brillant.</div>
                  <div className="sample-spec">UV ciblé · gabarit vectoriel requis</div>
                </div>
              </div>
              <div className="sample-card">
                <div className="sample-swatch foil">
                  <span className="sample-swatch-tag">Premium</span>
                  <span className="sample-swatch-corner">FOIL</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">Foil métallique (or)</div>
                  <div className="sample-desc">Estampage à chaud. Disponible en or, argent, cuivre, holo.</div>
                  <div className="sample-spec">Stamping or 24K · effet luxe haut de gamme</div>
                </div>
              </div>
              <div className="sample-card">
                <div className="sample-swatch holographic">
                  <span className="sample-swatch-tag">Nouveau</span>
                  <span className="sample-swatch-corner" style={{ background: "rgba(255,255,255,0.85)" } as React.CSSProperties}>HOLO</span>
                </div>
                <div className="sample-body">
                  <div className="sample-name">Foil holographique</div>
                  <div className="sample-desc">Reflets arc-en-ciel changeants selon l'angle. Effet futuriste.</div>
                  <div className="sample-spec">Stamping iridescent · 7 motifs disponibles</div>
                </div>
              </div>
            </div>
      
            {/* Action bar */}
            <div className="sample-action-bar">
              <div className="selected-list">
                <div className="selected-chip"><span className="selected-chip-dot">1</span>14pt Coated</div>
                <div className="selected-chip"><span className="selected-chip-dot">2</span>16pt Coated</div>
                <div className="selected-chip"><span className="selected-chip-dot">3</span>18pt Soft Touch</div>
              </div>
              <div className="selected-meta"><strong>3</strong> de 5 sélectionnés</div>
              <button className="send-cta">Envoyer à mon adresse →</button>
            </div>
      
            {/* Hint */}
            <div className="sample-hint">
              <span style={{ fontSize: "18px", fontStyle: "normal" } as React.CSSProperties}>💡</span>
              <span>« Les pros commandent toujours leurs échantillons avant le premier projet. Touche le 18pt soft touch — tu comprendras pourquoi nos clients reviennent. »</span>
            </div>
          </main>
        </div>
    </>
  );
}
