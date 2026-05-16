/**
 * Auto-migrated from Open Design HTML artifact `admin-template-editor.html`.
 *
 * NOTE: Lift-and-shift static rendering. Scripts ont été strip, data hardcodée.
 * Pour brancher la vraie data DB ou ajouter de l'interactivité, convertir en
 * Client Component ('use client') ou ajouter du data fetching Server Component.
 */

export const metadata = { title: "Admin — Éditeur template" };

export default function AdminTemplateEditor() {
  return (
    <>
      <div className="ed-shell">
      
          {/* ─── TOP BAR ───────────────────────────────────────────────── */}
          <header className="ed-topbar">
            <div className="ed-top-left">
              <a href="admin-templates.html" className="ed-back">
                <span className="ed-back-ico">←</span> Templates
              </a>
              <span className="ed-brand-tag">Admin</span>
              <h1 className="ed-tpl-name">Minimal — noir & blanc</h1>
              <span className="ed-tpl-slug">bc-minimal-bw</span>
              <span className="ed-saved">Modifié il y a 2 min · Auto-save activé</span>
            </div>
      
            <div className="ed-top-center">
              <div className="ed-zoom-group">
                <button className="ed-icon-btn" title="Annuler (⌘Z)">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 8h6.5a3 3 0 010 6H4M4 8l3-3M4 8l3 3" /></svg>
                </button>
                <button className="ed-icon-btn" title="Refaire (⌘⇧Z)">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8H5.5a3 3 0 000 6H12M12 8l-3-3M12 8l-3 3" /></svg>
                </button>
              </div>
              <div className="ed-divider"></div>
              <div className="ed-zoom-group">
                <button className="ed-icon-btn" title="Dézoomer">−</button>
                <span className="ed-zoom-value">100%</span>
                <button className="ed-icon-btn" title="Zoomer">+</button>
              </div>
              <div className="ed-divider"></div>
              <button className="ed-icon-btn" title="Adapter à l'écran">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" /></svg>
              </button>
            </div>
      
            <div className="ed-top-right">
              <button className="ed-toggle">
                <span className="ed-toggle-dot"></span>
                Aperçu live
              </button>
              <button className="btn btn-secondary btn-sm">Aperçu PDF</button>
              <button className="btn btn-primary btn-sm">Publier</button>
            </div>
          </header>
      
          {/* ─── 3-COL MAIN ────────────────────────────────────────────── */}
          <div className="ed-main">
      
            {/* ─── LEFT PANEL ──────────────────────────────────────────── */}
            <aside className="ed-panel ed-panel-left">
              <nav className="ed-tabs">
                <button className="ed-tab active">Champs</button>
                <button className="ed-tab">Calques</button>
              </nav>
              <div className="ed-panel-body">
      
                <div className="ed-panel-group-label">Texte</div>
      
                <div className="ed-field-row selected">
                  <span className="ed-field-ico">T</span>
                  <span className="ed-field-name">name</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action" title="Visible">●</span>
                    <span className="ed-field-action" title="Déverrouillé">⌜</span>
                  </span>
                </div>
                <div className="ed-field-row">
                  <span className="ed-field-ico">T</span>
                  <span className="ed-field-name">title</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action">●</span>
                    <span className="ed-field-action">⌜</span>
                  </span>
                </div>
                <div className="ed-field-row">
                  <span className="ed-field-ico">T</span>
                  <span className="ed-field-name">company</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action">●</span>
                    <span className="ed-field-action">⌜</span>
                  </span>
                </div>
      
                <div className="ed-panel-group-label">Forme</div>
      
                <div className="ed-field-row">
                  <span className="ed-field-ico">▬</span>
                  <span className="ed-field-name">divider</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action">●</span>
                    <span className="ed-field-action locked" title="Verrouillé">▣</span>
                  </span>
                </div>
      
                <div className="ed-panel-group-label">Contact</div>
      
                <div className="ed-field-row">
                  <span className="ed-field-ico">T</span>
                  <span className="ed-field-name">email</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action">●</span>
                    <span className="ed-field-action">⌜</span>
                  </span>
                </div>
                <div className="ed-field-row">
                  <span className="ed-field-ico">T</span>
                  <span className="ed-field-name">phone</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action">●</span>
                    <span className="ed-field-action">⌜</span>
                  </span>
                </div>
      
                <div className="ed-panel-group-label">Hors-canvas (verso)</div>
      
                <div className="ed-field-row">
                  <span className="ed-field-ico">T</span>
                  <span className="ed-field-name">tagline_verso</span>
                  <span className="ed-field-actions">
                    <span className="ed-field-action" style={{ color: "var(--text-muted)", opacity: "0.4" } as React.CSSProperties}>○</span>
                    <span className="ed-field-action">⌜</span>
                  </span>
                </div>
      
              </div>
              <div className="ed-panel-foot">
                <button className="ed-add-field">
                  <span>+ Ajouter un champ</span>
                  <span className="ed-add-field-arrow">Texte / Image / Forme / QR ▾</span>
                </button>
              </div>
            </aside>
      
            {/* ─── CANVAS ──────────────────────────────────────────────── */}
            <section className="ed-canvas-wrap">
              <div className="ed-ruler-corner"></div>
              <div className="ed-ruler-top">
                <span className="ed-ruler-tick" style={{ left: "20%" } as React.CSSProperties}>25 mm</span>
                <span className="ed-ruler-tick" style={{ left: "40%" } as React.CSSProperties}>50 mm</span>
                <span className="ed-ruler-tick" style={{ left: "60%" } as React.CSSProperties}>75 mm</span>
                <span className="ed-ruler-tick" style={{ left: "80%" } as React.CSSProperties}>95.25 mm →</span>
              </div>
              <div className="ed-ruler-left">
                <span className="ed-ruler-tick" style={{ top: "33%" } as React.CSSProperties}>20</span>
                <span className="ed-ruler-tick" style={{ top: "66%" } as React.CSSProperties}>40</span>
              </div>
      
              <div className="ed-canvas-area">
                <div className="ed-canvas">
                  <div className="ed-bleed"></div>
                  <div className="ed-safe"></div>
                  <div className="ed-card-board">
                    {/* Actual minimal B&W business card */}
                    <div className="bc-name">
                      Sophie Beauchamp
                      <div className="ed-selection">
                        <span className="ed-selection-label">name</span>
                        <span className="ed-handle tl"></span>
                        <span className="ed-handle tm"></span>
                        <span className="ed-handle tr"></span>
                        <span className="ed-handle ml"></span>
                        <span className="ed-handle mr"></span>
                        <span className="ed-handle bl"></span>
                        <span className="ed-handle bm"></span>
                        <span className="ed-handle br"></span>
                      </div>
                    </div>
                    <div className="bc-title">Directrice créative</div>
                    <div className="bc-company">Studio Atelier — Montréal</div>
                    <div className="bc-divider"></div>
                    <div className="bc-email">sophie@studio-atelier.ca</div>
                    <div className="bc-phone">+1 514 555 0182</div>
                  </div>
                </div>
              </div>
      
              <div className="ed-status-bar">
                <span className="ed-status-item"><strong>95.25 × 57.15 mm</strong></span>
                <span className="ed-status-item"><strong>CMYK</strong></span>
                <span className="ed-status-item"><strong>300 DPI</strong></span>
                <span className="ed-status-item">bleed <strong>0.125"</strong></span>
                <span className="ed-status-item">safe <strong>0.0625"</strong></span>
                <span className="ed-status-spacer"></span>
                <span className="ed-status-item">recto sur 2 · <strong>page 1 / 2</strong></span>
                <span className="ed-status-item">⊞ grille 5 mm</span>
              </div>
            </section>
      
            {/* ─── RIGHT PANEL ─────────────────────────────────────────── */}
            <aside className="ed-panel ed-panel-right">
              <nav className="ed-tabs">
                <button className="ed-tab active">Propriétés</button>
                <button className="ed-tab">Styles</button>
                <button className="ed-tab">Sample</button>
              </nav>
              <div className="ed-panel-body">
      
                <div className="ed-prop-group">
                  <div className="ed-prop-label">Sélection — name (texte)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: "var(--accent-soft)", borderRadius: "var(--r-sm)", marginBottom: "4px" } as React.CSSProperties}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: "700", color: "var(--accent-primary)" } as React.CSSProperties}>T</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: "600", color: "var(--accent-primary)" } as React.CSSProperties}>name</span>
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--accent-primary)", letterSpacing: "0.04em" } as React.CSSProperties}>requis</span>
                  </div>
                </div>
      
                <div className="ed-prop-group">
                  <div className="ed-prop-label">Position</div>
                  <div className="ed-prop-grid-2">
                    <div className="ed-input">
                      <div className="ed-input-label">X</div>
                      <div className="ed-input-wrap">
                        <input type="text" value="7" />
                        <span className="ed-input-unit">mm</span>
                      </div>
                    </div>
                    <div className="ed-input">
                      <div className="ed-input-label">Y</div>
                      <div className="ed-input-wrap">
                        <input type="text" value="10" />
                        <span className="ed-input-unit">mm</span>
                      </div>
                    </div>
                  </div>
                </div>
      
                <div className="ed-prop-group">
                  <div className="ed-prop-label">Taille</div>
                  <div className="ed-prop-grid-2">
                    <div className="ed-input">
                      <div className="ed-input-label">Largeur</div>
                      <div className="ed-input-wrap">
                        <input type="text" value="81" />
                        <span className="ed-input-unit">mm</span>
                      </div>
                    </div>
                    <div className="ed-input">
                      <div className="ed-input-label">Hauteur</div>
                      <div className="ed-input-wrap">
                        <input type="text" value="9" />
                        <span className="ed-input-unit">mm</span>
                      </div>
                    </div>
                  </div>
                </div>
      
                <div className="ed-prop-group">
                  <div className="ed-prop-label">Typo</div>
                  <div className="ed-prop-grid-2" style={{ marginBottom: "10px" } as React.CSSProperties}>
                    <div className="ed-input" style={{ gridColumn: "1 / -1" } as React.CSSProperties}>
                      <div className="ed-input-label">Famille</div>
                      <div className="ed-input-wrap">
                        <input type="text" value="Inter — 600" />
                        <span className="ed-input-unit">▾</span>
                      </div>
                    </div>
                  </div>
                  <div className="ed-prop-grid-2" style={{ marginBottom: "10px" } as React.CSSProperties}>
                    <div className="ed-input">
                      <div className="ed-input-label">Taille</div>
                      <div className="ed-input-wrap">
                        <input type="text" value="16" />
                        <span className="ed-input-unit">pt</span>
                      </div>
                    </div>
                    <div className="ed-input">
                      <div className="ed-input-label">Couleur</div>
                      <div className="ed-color-picker">
                        <span className="ed-color-swatch"></span>
                        <span className="ed-color-hex">#1A1A1A</span>
                      </div>
                    </div>
                  </div>
                  <div className="ed-input" style={{ marginBottom: "10px" } as React.CSSProperties}>
                    <div className="ed-input-label">Alignement</div>
                    <div className="ed-seg">
                      <button className="ed-seg-btn active">⟸</button>
                      <button className="ed-seg-btn">⟺</button>
                      <button className="ed-seg-btn">⟹</button>
                    </div>
                  </div>
                  <div className="ed-slider">
                    <div className="ed-slider-head">
                      <div className="ed-input-label">Interlettrage</div>
                      <span className="ed-slider-value">−0.01 em</span>
                    </div>
                    <div className="ed-slider-track">
                      <div className="ed-slider-fill" style={{ width: "38%" } as React.CSSProperties}></div>
                      <div className="ed-slider-thumb" style={{ left: "38%" } as React.CSSProperties}></div>
                    </div>
                  </div>
                </div>
      
                <div className="ed-prop-group">
                  <div className="ed-prop-label">Valeur d'exemple</div>
                  <div className="ed-textarea-wrap">
                    <textarea>Sophie Beauchamp</textarea>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", letterSpacing: "0.04em" } as React.CSSProperties}>
                    Visible dans les aperçus admin · jamais en production
                  </div>
                </div>
      
                <div className="ed-prop-group">
                  <div className="ed-prop-label">Variable</div>
                  <div className="ed-readonly">name</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", letterSpacing: "0.04em" } as React.CSSProperties}>
                    Mappé sur <strong style={{ color: "var(--text-secondary)" } as React.CSSProperties}>design.values.name</strong>
                  </div>
                </div>
      
                <div className="ed-prop-group">
                  <div className="ed-switch-row">
                    <div>
                      <div className="ed-switch-label">Requis</div>
                      <div className="ed-switch-hint">Bloque la création si vide</div>
                    </div>
                    <div className="ed-switch"></div>
                  </div>
                </div>
      
                <div className="ed-prop-group" style={{ borderBottom: "0" } as React.CSSProperties}>
                  <div className="ed-switch-row">
                    <div>
                      <div className="ed-switch-label">Multiligne</div>
                      <div className="ed-switch-hint">Autorise saut de ligne</div>
                    </div>
                    <div className="ed-switch off"></div>
                  </div>
                </div>
      
              </div>
            </aside>
      
          </div>
        </div>
    </>
  );
}
