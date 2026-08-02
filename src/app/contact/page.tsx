/**
 * /contact — page contact + formulaire (ContactForm client).
 */

import type { Route } from 'next';
import ContactForm from './ContactForm';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import MarketingHeader from '@/components/marketing/MarketingHeader';
import { SUPPORT_SLA } from '@/lib/content/marketing';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: "Parle-nous — Plio" };

export default function ContactPage() {
  return (
    <>
      <MarketingHeader
        links={[
          { href: '/order/start' as Route, label: 'Produits' },
          { href: '/about' as Route, label: 'Notre histoire' },
          { href: '/help' as Route, label: 'Aide' },
          { href: '/contact' as Route, label: 'Contact', active: true },
        ]}
        cta={{ href: '/order/start' as Route, label: 'Commander' }}
      />
      
        <main>
          {/* HERO */}
          <section className="contact-hero">
            <div className="page-eyebrow">On répond vite · vraiment</div>
            <h1>Parle-nous. <em>On répond.</em></h1>
            <p>Notre équipe est basée à Montréal et répond en français ou en anglais en {SUPPORT_SLA}.</p>
            <div className="response-badge">Réponse en {SUPPORT_SLA}</div>
          </section>
      
          {/* TWO COL */}
          <section className="contact-grid">
            {/* FORM — functional via /api/contact */}
            <ContactForm />
      
            {/* SIDEBAR */}
            <aside className="contact-sidebar">
              <div className="info-card">
                <div className="info-card-eyebrow"><Icon name="star" size={14} /> Support client</div>
                <h3>Pour les commandes en cours</h3>
                <div className="row"><span className="ic">@</span><a href="mailto:bonjour@plio.ca">bonjour@plio.ca</a></div>
                <div className="hours">Lun–Ven · 9 h–18 h ET · réponse en {SUPPORT_SLA}</div>
              </div>
      
              <div className="info-card">
                <div className="info-card-eyebrow"><Icon name="star" size={14} /> Ventes &amp; partenariats</div>
                <h3>Volumes, resellers, B2B</h3>
                <div className="row"><span className="ic">@</span><a href="mailto:sales@plio.ca">sales@plio.ca</a></div>
                <div className="hours">Lun–Ven · 9 h–17 h ET</div>
              </div>

              <div className="info-card">
                <div className="info-card-eyebrow"><Icon name="star" size={14} /> Devis sur-mesure</div>
                <h3>Projets hors catalogue</h3>
                <div className="row"><span className="ic"><Icon name="clipboard" size={14} /></span><a href="/quote">Demander un quote →</a></div>
                <div className="hours">Réponse 1-2 jours ouvrables</div>
              </div>
      
              <div className="info-card">
                <div className="info-card-eyebrow"><Icon name="star" size={14} /> Adresse postale</div>
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
              <a href="/help" className="faq-teaser-btn">Centre d'aide →</a>
            </div>
          </section>
        </main>
      
        <MarketingFooter />
    </>
  );
}
