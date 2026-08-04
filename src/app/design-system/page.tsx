/**
 * Auto-migrated from Open Design HTML artifact `design-system.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

export const metadata = { title: "Design System" };

export default function DesignSystemPage() {
  return (
    <>
      <div className="app">
          <aside className="nav">
            <div className="wordmark">Plio.</div>
            <div className="wordmark-sub">Design System v0.1</div>
            <ul>
              <li><a href="#brand" className="active">Brand <kbd>1</kbd></a></li>
              <li><a href="#couleurs">Couleurs <kbd>2</kbd></a></li>
              <li><a href="#typo">Typographie <kbd>3</kbd></a></li>
              <li><a href="#espacement">Espacement <kbd>4</kbd></a></li>
              <li><a href="#radius">Radius <kbd>5</kbd></a></li>
              <li><a href="#ombres">Ombres <kbd>6</kbd></a></li>
              <li><a href="#composants">Composants <kbd>7</kbd></a></li>
              <li><a href="#patterns">Patterns <kbd>8</kbd></a></li>
            </ul>
            <div className="nav-controls">
              <div className="toggle-row">
                <span>Theme</span>
                <div className="pill-toggle" id="theme-toggle">
                  <button aria-pressed="true" data-theme="light">Light</button>
                  <button aria-pressed="false" data-theme="dark">Dark</button>
                </div>
              </div>
              <div className="toggle-row">
                <span>Locale</span>
                <div className="pill-toggle">
                  <button aria-pressed="true">FR</button>
                  <button aria-pressed="false">EN</button>
                </div>
              </div>
            </div>
          </aside>
      
          <main className="content">
            {/* HERO */}
            <section id="brand" className="hero">
              <div className="hero-eyebrow">Design System · Canada · CAD</div>
              <h1>Devis instantané.<br /><em>Commande en deux minutes.</em></h1>
              <p>Le système visuel de Plio — un site de print wholesale au Canada. Calme, précis, intemporel.</p>
              <div className="hero-meta">
                <div>VOIX<strong>Linear × MUJI × Stripe</strong></div>
                <div>MARCHÉ<strong>Canada · Bilingue FR/EN</strong></div>
                <div>CATALOGUE<strong>Des centaines de produits (CA)</strong></div>
                <div>VERSION<strong>v0.1 · 2026-05-15</strong></div>
              </div>
            </section>
      
            {/* COULEURS */}
            <section id="couleurs">
              <div className="eyebrow">02 — Couleurs</div>
              <h2 className="section-title">Tokens sémantiques</h2>
              <p className="section-lede">Aucun hex raw dans les composants. Chaque token a un rôle (surface, accent, danger), pas une couleur.</p>
      
              <div className="color-cluster-title">Surfaces</div>
              <div className="color-grid">
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--bg-canvas)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Canvas</span><span className="var">--bg-canvas</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--bg-surface)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Surface</span><span className="var">--bg-surface</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--bg-sunken)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Sunken</span><span className="var">--bg-sunken</span></div></div>
              </div>
      
              <div className="color-cluster-title">Texte</div>
              <div className="color-grid">
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--text-primary)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Primary</span><span className="var">--text-primary</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--text-secondary)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Secondary</span><span className="var">--text-secondary</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--text-muted)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Muted</span><span className="var">--text-muted</span></div></div>
              </div>
      
              <div className="color-cluster-title">Accent (Vert sapin)</div>
              <div className="color-grid">
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--accent-primary)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Primary</span><span className="var">--accent-primary</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--accent-hover)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Hover</span><span className="var">--accent-hover</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--accent-pressed)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Pressed</span><span className="var">--accent-pressed</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--accent-soft)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Soft</span><span className="var">--accent-soft</span></div></div>
              </div>
      
              <div className="color-cluster-title">Statuts</div>
              <div className="color-grid">
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--success)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Success</span><span className="var">--success</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--warning)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Warning</span><span className="var">--warning</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--danger)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Danger</span><span className="var">--danger</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--info)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Info</span><span className="var">--info</span></div></div>
              </div>
      
              <div className="color-cluster-title">Papier (Material swatches)</div>
              <div className="color-grid">
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--paper-warm)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Warm</span><span className="var">--paper-warm</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--paper-bright)", borderBottomColor: "var(--border-default)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Bright</span><span className="var">--paper-bright</span></div></div>
                <div className="swatch"><div className="swatch-color" style={{ background: "var(--paper-kraft)" } as React.CSSProperties}></div><div className="swatch-meta"><span className="name">Kraft</span><span className="var">--paper-kraft</span></div></div>
              </div>
            </section>
      
            {/* TYPOGRAPHIE */}
            <section id="typo">
              <div className="eyebrow">03 — Typographie</div>
              <h2 className="section-title">Trois familles, un rythme</h2>
              <p className="section-lede">Display serif pour l'éditorial, Inter pour la lecture, JetBrains Mono pour les chiffres.</p>
      
              <div className="type-ramp">
                <div className="type-row">
                  <div className="type-meta"><strong>display-2xl</strong>display, 600<br />clamp(56px, 9vw, 128px)<br />line 0.95 / -0.04em</div>
                  <div className="t-display-2xl">Plio.</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>display-xl</strong>display, 600<br />clamp(40px, 6vw, 88px)<br />line 0.98 / -0.03em</div>
                  <div className="t-display-xl">Quoi imprimer ?</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>display-lg</strong>display, 600<br />clamp(32px, 4vw, 56px)<br />line 1.05 / -0.02em</div>
                  <div className="t-display-lg">Configure ta commande.</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>heading-xl</strong>body, 600<br />32px / 1.15</div>
                  <div className="t-heading-xl">Cartes de visite 14pt + UV (High Gloss)</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>heading-lg</strong>body, 600<br />24px / 1.2</div>
                  <div className="t-heading-lg">Méthode de livraison</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>heading-md</strong>body, 600<br />20px / 1.3</div>
                  <div className="t-heading-md">Adresse d'expédition</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>body-lg</strong>body, 400<br />18px / 1.5</div>
                  <div className="t-body-lg">Glisse ton fichier ici, ou clique pour parcourir. PDF, AI, PSD ou JPG.</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>body-md (base)</strong>body, 400<br />16px / 1.55</div>
                  <div className="t-body-md">Ton design est validé. Bleed 0.125", CMYK, résolution 300 DPI.</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>body-sm</strong>body, 400<br />14px / 1.5</div>
                  <div className="t-body-sm">Production démarre dès paiement. Tracking number par courriel sous 24h.</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>caption</strong>body, 400 caps<br />13px / +0.02em</div>
                  <div className="t-caption">À partir de</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>micro</strong>mono, 600 caps<br />11px / +0.06em</div>
                  <div className="t-micro">Étape 03 sur 07 — Configuration</div>
                </div>
                <div className="type-row">
                  <div className="type-meta"><strong>mono number</strong>mono, 500<br />Pour les prix &amp; codes</div>
                  <div className="t-mono" style={{ fontSize: "32px", fontWeight: "600" } as React.CSSProperties}>125,90 $ <span style={{ color: "var(--text-muted)", fontSize: "16px" } as React.CSSProperties}>CAD</span></div>
                </div>
              </div>
            </section>
      
            {/* ESPACEMENT */}
            <section id="espacement">
              <div className="eyebrow">04 — Espacement</div>
              <h2 className="section-title">Échelle 4px</h2>
              <p className="section-lede">Une seule échelle, valeurs limitées. La discipline crée le rythme.</p>
      
              <div className="spacing-scale">
                <div className="spacing-row"><span className="label">space-1</span><span className="px">4px</span><div className="spacing-bar" style={{ width: "4px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-2</span><span className="px">8px</span><div className="spacing-bar" style={{ width: "8px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-3</span><span className="px">12px</span><div className="spacing-bar" style={{ width: "12px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-4</span><span className="px">16px</span><div className="spacing-bar" style={{ width: "16px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-6</span><span className="px">24px</span><div className="spacing-bar" style={{ width: "24px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-8</span><span className="px">32px</span><div className="spacing-bar" style={{ width: "32px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-12</span><span className="px">48px</span><div className="spacing-bar" style={{ width: "48px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-16</span><span className="px">64px</span><div className="spacing-bar" style={{ width: "64px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-24</span><span className="px">96px</span><div className="spacing-bar" style={{ width: "96px" } as React.CSSProperties}></div></div>
                <div className="spacing-row"><span className="label">space-32</span><span className="px">128px</span><div className="spacing-bar" style={{ width: "128px" } as React.CSSProperties}></div></div>
              </div>
            </section>
      
            {/* RADIUS */}
            <section id="radius">
              <div className="eyebrow">05 — Radius</div>
              <h2 className="section-title">Coins doux</h2>
              <p className="section-lede">Du plus net (xs, pour les kbd) au plus rond (pill, pour les CTA).</p>
      
              <div className="radius-grid">
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-xs)" } as React.CSSProperties}></div><div className="radius-label"><strong>xs</strong>4px</div></div>
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-sm)" } as React.CSSProperties}></div><div className="radius-label"><strong>sm</strong>8px</div></div>
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-md)" } as React.CSSProperties}></div><div className="radius-label"><strong>md</strong>12px</div></div>
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-lg)" } as React.CSSProperties}></div><div className="radius-label"><strong>lg</strong>16px</div></div>
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-xl)" } as React.CSSProperties}></div><div className="radius-label"><strong>xl</strong>24px</div></div>
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-2xl)" } as React.CSSProperties}></div><div className="radius-label"><strong>2xl</strong>32px</div></div>
                <div className="radius-item"><div className="radius-box" style={{ borderRadius: "var(--r-pill)" } as React.CSSProperties}></div><div className="radius-label"><strong>pill</strong>9999px</div></div>
              </div>
            </section>
      
            {/* OMBRES */}
            <section id="ombres">
              <div className="eyebrow">06 — Ombres</div>
              <h2 className="section-title">Profondeur layered</h2>
              <p className="section-lede">Toujours deux offsets superposés, jamais une simple ombre plate.</p>
      
              <div className="shadow-grid">
                <div className="shadow-item" style={{ boxShadow: "var(--shadow-xs)" } as React.CSSProperties}><div className="shadow-label">XS<strong>shadow-xs</strong></div></div>
                <div className="shadow-item" style={{ boxShadow: "var(--shadow-sm)" } as React.CSSProperties}><div className="shadow-label">SM<strong>shadow-sm</strong></div></div>
                <div className="shadow-item" style={{ boxShadow: "var(--shadow-md)" } as React.CSSProperties}><div className="shadow-label">MD<strong>shadow-md</strong></div></div>
                <div className="shadow-item" style={{ boxShadow: "var(--shadow-lg)" } as React.CSSProperties}><div className="shadow-label">LG<strong>shadow-lg</strong></div></div>
                <div className="shadow-item" style={{ boxShadow: "var(--shadow-xl)" } as React.CSSProperties}><div className="shadow-label">XL<strong>shadow-xl</strong></div></div>
                <div className="shadow-item" style={{ boxShadow: "var(--shadow-accent)" } as React.CSSProperties}><div className="shadow-label">ACCENT<strong>shadow-accent</strong></div></div>
              </div>
            </section>
      
            {/* COMPOSANTS */}
            <section id="composants">
              <div className="eyebrow">07 — Composants</div>
              <h2 className="section-title">Primitives</h2>
              <p className="section-lede">Toutes les briques utilisées à travers les écrans du wizard. Tous les états sont visibles.</p>
      
              <div className="components-grid">
      
                {/* Buttons */}
                <div>
                  <p className="comp-name">Button</p>
                  <div className="btn-row">
                    <button className="btn btn-primary">Continuer <kbd>↵</kbd></button>
                    <button className="btn btn-secondary">Précédent</button>
                    <button className="btn btn-ghost">Annuler</button>
                    <button className="btn btn-danger">Supprimer</button>
                    <button className="btn btn-primary" disabled>Disabled</button>
                  </div>
                  <div className="btn-row" style={{ marginTop: "12px" } as React.CSSProperties}>
                    <button className="btn btn-primary btn-sm">Small</button>
                    <button className="btn btn-primary">Medium</button>
                    <button className="btn btn-primary btn-lg">Large</button>
                  </div>
                </div>
      
                {/* Field */}
                <div>
                  <p className="comp-name">Input / Field</p>
                  <div className="field-stack">
                    {/* Round 36 #1 — Avant : patrick@plio.ca + H2X hardcodés
                        leakaient PII du dev sur une page live publique.
                        Remplacés par placeholders génériques + defaultValue
                        (pas value, sinon React warn controlled input). */}
                    <div>
                      <div className="field">
                        <label htmlFor="ds-email-demo">Email</label>
                        <input
                          id="ds-email-demo"
                          type="email"
                          defaultValue="nom@exemple.ca"
                          readOnly
                        />
                      </div>
                    </div>
                    <div>
                      <div className="field">
                        <label htmlFor="ds-phone-demo">Téléphone</label>
                        <input
                          id="ds-phone-demo"
                          type="tel"
                          placeholder="(514) 555-0123"
                          readOnly
                        />
                      </div>
                      <div className="field-helper">Format canadien (XXX) XXX-XXXX</div>
                    </div>
                    <div>
                      <div className="field field-error">
                        <label htmlFor="ds-postal-demo">Code postal</label>
                        <input
                          id="ds-postal-demo"
                          type="text"
                          defaultValue="A1A"
                          readOnly
                        />
                      </div>
                      <div className="field-helper error">Format invalide — attendu A1A 1A1</div>
                    </div>
                  </div>
                </div>
      
                {/* RadioCard */}
                <div>
                  <p className="comp-name">RadioCard (le pattern dominant)</p>
                  <div className="radio-cards">
                    <div className="radio-card">
                      <div className="radio-card-title">14pt Coated</div>
                      <div className="radio-card-desc">Le standard. Rendu CMYK excellent, durable.</div>
                      <div className="radio-card-meta">
                        <span className="radio-card-price">+0,00 $</span>
                        <span className="radio-card-delta">350 GSM</span>
                      </div>
                    </div>
                    <div className="radio-card selected">
                      <span className="badge-pop">Populaire</span>
                      <div className="radio-card-title">16pt Matte</div>
                      <div className="radio-card-desc">Toucher mat moderne, premium.</div>
                      <div className="radio-card-meta">
                        <span className="radio-card-price">+0,12 $/u</span>
                        <span className="radio-card-delta">400 GSM</span>
                      </div>
                    </div>
                    <div className="radio-card">
                      <div className="radio-card-title">18pt Soft Touch</div>
                      <div className="radio-card-desc">Sensation veloutée. Pour avocats, agences.</div>
                      <div className="radio-card-meta">
                        <span className="radio-card-price">+0,24 $/u</span>
                        <span className="radio-card-delta">450 GSM</span>
                      </div>
                    </div>
                  </div>
                </div>
      
                {/* Badges */}
                <div>
                  <p className="comp-name">Badge / Pill</p>
                  <div className="badge-row">
                    <span className="badge badge-neutral">Neutral</span>
                    <span className="badge badge-accent">Accent</span>
                    <span className="badge badge-success">Livré</span>
                    <span className="badge badge-warning">En production</span>
                    <span className="badge badge-danger">Annulée</span>
                    <span className="badge badge-info">Expédiée</span>
                  </div>
                </div>
      
                {/* Progress */}
                <div>
                  <p className="comp-name">ProgressSegmented (7 étapes)</p>
                  <div className="progress">
                    <div className="progress-segment done"></div>
                    <div className="progress-segment done"></div>
                    <div className="progress-segment active"></div>
                    <div className="progress-segment"></div>
                    <div className="progress-segment"></div>
                    <div className="progress-segment"></div>
                    <div className="progress-segment"></div>
                  </div>
                  <div className="t-micro" style={{ marginTop: "12px", color: "var(--text-muted)" } as React.CSSProperties}>Étape 03 sur 07 — Configuration</div>
                </div>
      
                {/* Slider */}
                <div>
                  <p className="comp-name">Slider (qty snap)</p>
                  <div className="slider-wrap">
                    <div className="slider-track">
                      <div className="slider-fill"></div>
                      <div className="slider-thumb"></div>
                    </div>
                    <div className="slider-ticks">
                      <span>100</span><span>250</span><span>500</span><span>1k</span><span>2.5k</span><span>5k</span>
                    </div>
                  </div>
                </div>
      
                {/* Big number */}
                <div>
                  <p className="comp-name">Live Price (gros chiffre, font-display)</p>
                  <div className="price-display">125<span style={{ fontSize: "0.5em", color: "var(--text-secondary)" } as React.CSSProperties}>,90 $</span></div>
                  <div className="t-caption" style={{ marginTop: "4px" } as React.CSSProperties}>CAD · Taxes incluses</div>
                </div>
      
                {/* Switch */}
                <div>
                  <p className="comp-name">Switch (toggle)</p>
                  <div className="row">
                    <div className="switch" aria-checked="false" role="switch"></div>
                    <div className="switch" aria-checked="true" role="switch"></div>
                    <span className="t-body-sm" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Sauvegarder pour la prochaine commande</span>
                  </div>
                </div>
      
                {/* Toasts */}
                <div>
                  <p className="comp-name">Toast</p>
                  <div className="stack">
                    <div className="toast toast-success"><div className="toast-icon">✓</div><div><strong>Devis sauvegardé.</strong><br /><span style={{ color: "var(--text-muted)", fontSize: "13px" } as React.CSSProperties}>Tu peux reprendre où tu étais à tout moment.</span></div></div>
                    <div className="toast toast-error"><div className="toast-icon">!</div><div><strong>Téléversement échoué.</strong><br /><span style={{ color: "var(--text-muted)", fontSize: "13px" } as React.CSSProperties}>Vérifie ta connexion et réessaie.</span></div></div>
                    <div className="toast toast-info"><div className="toast-icon">i</div><div><strong>Production démarrée.</strong><br /><span style={{ color: "var(--text-muted)", fontSize: "13px" } as React.CSSProperties}>Commande #SIN-32 — tracking sous 24h.</span></div></div>
                  </div>
                </div>
      
                {/* Cards */}
                <div>
                  <p className="comp-name">Card variants</p>
                  <div className="card-row">
                    <div className="card card-flat">
                      <div className="t-micro" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Flat</div>
                      <div className="t-heading-md" style={{ marginTop: "8px" } as React.CSSProperties}>Carte plate</div>
                      <div className="t-body-sm" style={{ color: "var(--text-secondary)", marginTop: "4px" } as React.CSSProperties}>Sans ombre, juste une bordure subtle.</div>
                    </div>
                    <div className="card card-elevated">
                      <div className="t-micro" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Elevated</div>
                      <div className="t-heading-md" style={{ marginTop: "8px" } as React.CSSProperties}>Carte élevée</div>
                      <div className="t-body-sm" style={{ color: "var(--text-secondary)", marginTop: "4px" } as React.CSSProperties}>Shadow-md, pour les éléments importants.</div>
                    </div>
                    <div className="card card-interactive">
                      <div className="t-micro" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Interactive →</div>
                      <div className="t-heading-md" style={{ marginTop: "8px" } as React.CSSProperties}>Carte cliquable</div>
                      <div className="t-body-sm" style={{ color: "var(--text-secondary)", marginTop: "4px" } as React.CSSProperties}>Lift au hover, focus ring.</div>
                    </div>
                  </div>
                </div>
      
                {/* Skeleton */}
                <div>
                  <p className="comp-name">Skeleton (loading)</p>
                  <div className="card card-flat" style={{ display: "grid", gap: "12px" } as React.CSSProperties}>
                    <div className="skeleton" style={{ height: "24px", width: "60%" } as React.CSSProperties}></div>
                    <div className="skeleton" style={{ height: "16px", width: "90%" } as React.CSSProperties}></div>
                    <div className="skeleton" style={{ height: "16px", width: "80%" } as React.CSSProperties}></div>
                    <div className="skeleton" style={{ height: "40px", width: "30%", borderRadius: "var(--r-pill)" } as React.CSSProperties}></div>
                  </div>
                </div>
      
                {/* Kbd */}
                <div>
                  <p className="comp-name">Kbd (raccourcis)</p>
                  <div className="row">
                    <div className="row" style={{ gap: "4px" } as React.CSSProperties}><span className="kbd">⌘</span><span className="kbd">K</span><span className="t-body-sm" style={{ color: "var(--text-muted)", marginLeft: "8px" } as React.CSSProperties}>Palette de commandes</span></div>
                    <div className="row" style={{ gap: "4px" } as React.CSSProperties}><span className="kbd">↵</span><span className="t-body-sm" style={{ color: "var(--text-muted)", marginLeft: "8px" } as React.CSSProperties}>Continuer</span></div>
                    <div className="row" style={{ gap: "4px" } as React.CSSProperties}><span className="kbd">Esc</span><span className="t-body-sm" style={{ color: "var(--text-muted)", marginLeft: "8px" } as React.CSSProperties}>Fermer</span></div>
                    <div className="row" style={{ gap: "4px" } as React.CSSProperties}><span className="kbd">/</span><span className="t-body-sm" style={{ color: "var(--text-muted)", marginLeft: "8px" } as React.CSSProperties}>Recherche</span></div>
                  </div>
                </div>
      
                {/* Focus demo */}
                <div>
                  <p className="comp-name">Focus rings (Tab pour voir)</p>
                  <div className="row">
                    <button className="focus-demo">Bouton tabbable</button>
                    <a href="#" className="focus-demo">Lien tabbable</a>
                    <button className="btn btn-primary">CTA tabbable</button>
                  </div>
                </div>
      
              </div>
            </section>
      
            {/* PATTERNS */}
            <section id="patterns">
              <div className="eyebrow">08 — Patterns</div>
              <h2 className="section-title">Compositions récurrentes</h2>
              <p className="section-lede">Comment les primitives s'assemblent dans le wizard.</p>
      
              <div className="components-grid">
      
                {/* Question pattern */}
                <div>
                  <p className="comp-name">Question d'étape (Typeform style)</p>
                  <div className="card card-flat" style={{ padding: "64px" } as React.CSSProperties}>
                    <div className="t-micro" style={{ color: "var(--accent-primary)" } as React.CSSProperties}>Étape 03 — Cartes 14pt + UV</div>
                    <h3 className="t-display-lg" style={{ margin: "12px 0 16px" } as React.CSSProperties}>Quel format ?</h3>
                    <p className="t-body-lg" style={{ color: "var(--text-secondary)", margin: "0 0 32px" } as React.CSSProperties}>Le standard nord-américain est 3,5 × 2 pouces.</p>
                    <div className="radio-cards">
                      <div className="radio-card selected">
                        <span className="badge-pop">Standard</span>
                        <div style={{ display: "grid", placeItems: "center", padding: "24px", background: "var(--paper-warm)", borderRadius: "var(--r-md)", marginBottom: "12px" } as React.CSSProperties}>
                          <div style={{ width: "100%", aspectRatio: "3.5/2", background: "white", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-xs)" } as React.CSSProperties}></div>
                        </div>
                        <div className="radio-card-title">3,5 × 2 in</div>
                        <div className="radio-card-desc">Format business card classique</div>
                      </div>
                      <div className="radio-card">
                        <div style={{ display: "grid", placeItems: "center", padding: "24px", background: "var(--paper-warm)", borderRadius: "var(--r-md)", marginBottom: "12px" } as React.CSSProperties}>
                          <div style={{ width: "60%", aspectRatio: "2/3.5", background: "white", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-xs)" } as React.CSSProperties}></div>
                        </div>
                        <div className="radio-card-title">2 × 3,5 in</div>
                        <div className="radio-card-desc">Vertical, à la mode</div>
                      </div>
                      <div className="radio-card">
                        <div style={{ display: "grid", placeItems: "center", padding: "24px", background: "var(--paper-warm)", borderRadius: "var(--r-md)", marginBottom: "12px" } as React.CSSProperties}>
                          <div style={{ width: "75%", aspectRatio: "1", background: "white", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-xs)" } as React.CSSProperties}></div>
                        </div>
                        <div className="radio-card-title">2,5 × 2,5 in</div>
                        <div className="radio-card-desc">Carré, distinctif</div>
                      </div>
                    </div>
                  </div>
                </div>
      
                {/* Récap pattern */}
                <div>
                  <p className="comp-name">Panneau récap live (sidebar Step 1→7)</p>
                  <div className="card card-elevated" style={{ maxWidth: "360px", padding: "32px" } as React.CSSProperties}>
                    <div className="t-micro" style={{ color: "var(--text-muted)", marginBottom: "24px" } as React.CSSProperties}>Ta commande</div>
                    <div style={{ display: "grid", gap: "12px", fontSize: "14px" } as React.CSSProperties}>
                      <div style={{ display: "flex", justifyContent: "space-between" } as React.CSSProperties}><span style={{ color: "var(--text-muted)" } as React.CSSProperties}>Produit</span><span>Cartes 14pt + UV</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" } as React.CSSProperties}><span style={{ color: "var(--text-muted)" } as React.CSSProperties}>Format</span><span className="t-mono">3,5 × 2 in</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" } as React.CSSProperties}><span style={{ color: "var(--text-muted)" } as React.CSSProperties}>Stock</span><span>16pt Matte</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" } as React.CSSProperties}><span style={{ color: "var(--text-muted)" } as React.CSSProperties}>Quantité</span><span className="t-mono">1 000</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" } as React.CSSProperties}><span style={{ color: "var(--text-muted)" } as React.CSSProperties}>Délai</span><span>4-5 jours</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" } as React.CSSProperties}><span style={{ color: "var(--text-muted)" } as React.CSSProperties}>Livraison</span><span>UPS Standard</span></div>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "24px", paddingTop: "24px" } as React.CSSProperties}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-muted)", marginBottom: "4px" } as React.CSSProperties}><span>Sous-total</span><span className="t-mono">100,40 $</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-muted)", marginBottom: "4px" } as React.CSSProperties}><span>Livraison</span><span className="t-mono">9,10 $</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" } as React.CSSProperties}><span>TPS + TVQ</span><span className="t-mono">16,40 $</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" } as React.CSSProperties}>
                        <span className="t-micro">Total</span>
                        <span className="t-mono" style={{ fontSize: "32px", fontWeight: "600", color: "var(--accent-primary)" } as React.CSSProperties}>125,90 $</span>
                      </div>
                    </div>
                  </div>
                </div>
      
                {/* App shell */}
                <div>
                  <p className="comp-name">App Shell (header sticky avec progression)</p>
                  <div className="card card-elevated" style={{ padding: "0", overflow: "hidden" } as React.CSSProperties}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)" } as React.CSSProperties}>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" } as React.CSSProperties}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: "22px", color: "var(--accent-primary)", letterSpacing: "-0.02em" } as React.CSSProperties}>Plio.</span>
                        <span style={{ color: "var(--border-strong)" } as React.CSSProperties}>/</span>
                        <span className="t-body-sm" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Cartes de visite › 14pt + UV</span>
                      </div>
                      <div style={{ flex: "0 0 320px" } as React.CSSProperties}>
                        <div className="progress">
                          <div className="progress-segment done"></div><div className="progress-segment done"></div>
                          <div className="progress-segment active"></div>
                          <div className="progress-segment"></div><div className="progress-segment"></div><div className="progress-segment"></div><div className="progress-segment"></div>
                        </div>
                        <div className="t-micro" style={{ marginTop: "8px", color: "var(--text-muted)", textAlign: "center" } as React.CSSProperties}>Étape 03 sur 07 — Configuration</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" } as React.CSSProperties}>
                        <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
                        <span className="t-body-sm" style={{ color: "var(--text-muted)" } as React.CSSProperties}>Sauvegardé · 12s</span>
                      </div>
                    </div>
                  </div>
                </div>
      
              </div>
            </section>
      
          </main>
        </div>
    </>
  );
}
