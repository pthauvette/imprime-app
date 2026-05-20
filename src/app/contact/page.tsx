/**
 * /contact — page contact + formulaire (ContactForm client).
 */

import ContactForm from './ContactForm';
import MarketingFooter from '@/components/marketing/MarketingFooter';

export const metadata = { title: "Parle-nous — Plio" };

export default function ContactPage() {
  return (
    <>
      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="/order/start" className="mkt-nav-link">Produits</a>
            <a href="/about" className="mkt-nav-link">Notre histoire</a>
            <a href="/contact" className="mkt-nav-link">Aide</a>
            <a href="/contact" className="mkt-nav-link active">Contact</a>
            <a href="/order/start" className="mkt-nav-cta">Commander →</a>
          </div>
        </nav>
      
        <main>
          {/* HERO */}
          <section className="contact-hero">
            <div className="page-eyebrow">On répond vite · vraiment</div>
            <h1>Parle-nous. <em>On répond.</em></h1>
            <p>Notre équipe est basée à Montréal et répond en français ou en anglais en moins de 4 heures ouvrables.</p>
            <div className="response-badge">Temps de réponse moyen · 1 h 47 aujourd'hui</div>
          </section>
      
          {/* TWO COL */}
          <section className="contact-grid">
            {/* FORM — functional via /api/contact */}
            <ContactForm />
      
            {/* SIDEBAR */}
            <aside className="contact-sidebar">
              <div className="info-card">
                <div className="info-card-eyebrow">★ Support client</div>
                <h3>Pour les commandes en cours</h3>
                <div className="row"><span className="ic">@</span><a href="mailto:bonjour@plio.ca">bonjour@plio.ca</a></div>
                <div className="row"><span className="ic">💬</span>Chat en direct dans l'app</div>
                <div className="hours">Lun–Ven · 9 h–18 h ET</div>
              </div>
      
              <div className="info-card">
                <div className="info-card-eyebrow">★ Ventes &amp; partenariats</div>
                <h3>Volumes, resellers, B2B</h3>
                <div className="row"><span className="ic">@</span><a href="mailto:sales@plio.ca">sales@plio.ca</a></div>
                <div className="row"><span className="ic">☎</span><a href="tel:+15145550144">+1 514 555 0144</a></div>
                <div className="hours">Lun–Ven · 9 h–17 h ET</div>
              </div>

              <div className="info-card">
                <div className="info-card-eyebrow">★ Devis sur-mesure</div>
                <h3>Projets hors catalogue</h3>
                <div className="row"><span className="ic">📋</span><a href="/quote">Demander un quote →</a></div>
                <div className="hours">Réponse 1-2 jours ouvrables</div>
              </div>
      
              <div className="info-card">
                <div className="info-card-eyebrow">★ Adresse postale</div>
                <h3>Bureau de Montréal</h3>
                <div className="row"><span className="ic">⌖</span>
                  <div style={{ lineHeight: "1.5" } as React.CSSProperties}>4220 boul. St-Laurent, suite 200<br />Montréal QC H2W 1Z3</div>
                </div>
              </div>
      
              <div className="info-card map-card">
                <div className="map-placeholder">
                  <div className="map-pin"><div className="map-pulse"></div></div>
                </div>
                <div className="map-caption">
                  <span>45,5223° N · 73,5947° O</span>
                  <span>Bureau ouvert sur RDV</span>
                </div>
              </div>
            </aside>
          </section>
      
          {/* FAQ TEASER */}
          <section className="faq-teaser">
            <div className="faq-teaser-card">
              <div>
                <h2>Avant de nous écrire — <em>peut-être qu'on a déjà la réponse.</em></h2>
                <p>Notre centre d'aide couvre 90 % des questions, avec des réponses claires sans jargon. Délais, fichiers, retours, paiements — tout est là.</p>
              </div>
              <a href="/contact" className="faq-teaser-btn">Centre d'aide →</a>
            </div>
          </section>
        </main>
      
        <MarketingFooter />
    </>
  );
}
