/**
 * Auto-migrated from Open Design HTML artifact `landing.html`.
 *
 * NOTE: Lift-and-shift static rendering. Interactive scripts ont été strip.
 * Pour ajouter de l'interactivité, convertir en Client Component ('use client').
 */

import NewsletterSignup from '@/components/marketing/NewsletterSignup';
import TestimonialsSection from '@/components/marketing/TestimonialsSection';
import LangSwitch from '@/components/i18n/LangSwitch';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import UserMenu from '@/components/account/UserMenu';
import { getServerLocale } from '@/lib/i18n/locale';
import { translate } from '@/lib/i18n/messages';
import { auth } from '@/auth';

export const metadata = { title: "Plio — Print wholesale au Canada" };

export default async function LandingPage() {
  // POC i18n : nav + hero CTA traduits server-side via cookie plio_lang.
  // Le reste du contenu marketing reste en FR (migration incrémentale).
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const session = await auth();
  const sessionUser = session?.user;

  return (
    <>
      {/* Onboarding modal pour les 1ers visites (cookie plio_tour).
          Affiché uniquement sur la home — pas sur les landing pages
          (blog, /samples, /quote) où le user arrive avec une intent
          précise et ne veut pas être interrompu. */}
      <OnboardingTour />

      <nav className="mkt-nav">
          <a href="#" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="#products" className="mkt-nav-link">{t('nav.products')}</a>
            <a href="#how" className="mkt-nav-link">{t('nav.howItWorks')}</a>
            <a href="/blog" className="mkt-nav-link">{t('nav.blog')}</a>
            {sessionUser ? (
              <>
                <a href="/order/start" className="mkt-nav-cta">{t('nav.startOrder')} →</a>
                <UserMenu
                  user={{
                    name: sessionUser.name ?? null,
                    email: sessionUser.email ?? '',
                    image: sessionUser.image ?? null,
                  }}
                />
              </>
            ) : (
              <>
                <a href="/sign-in" className="mkt-nav-link">{t('nav.signIn')}</a>
                <a href="/order/start" className="mkt-nav-cta">{t('nav.startOrder')} →</a>
                <LangSwitch />
              </>
            )}
          </div>
        </nav>

        <main>
          {/* HERO */}
          <section className="hero">
            <div>
              <div className="hero-eyebrow">{t('hero.eyebrow')}</div>
              <h1>{t('hero.title')}</h1>
              <p className="hero-lede">{t('hero.subtitle')}</p>
              <div className="hero-actions">
                <a href="/order/start" className="hero-cta-primary">{t('hero.cta.primary')}</a>
                <a href="#products" className="hero-cta-secondary">{t('hero.cta.secondary')} ↓</a>
              </div>
              <div className="hero-trust">
                <span className="hero-trust-item">Sans abonnement</span>
                <span className="hero-trust-item">Sans minimum absurde</span>
                <span className="hero-trust-item">Échantillons gratuits</span>
                <span className="hero-trust-item">100 % imprimé au Canada</span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="stack-card stack-1">
                <div className="scn">Sophie Beauchamp</div>
                <div className="scd"></div>
                <div className="sct">Directrice créative</div>
                <div className="scm">+1 514 555 0123 · vingtdeux.studio</div>
              </div>
              <div className="stack-card stack-2">
                <div className="logo-circle"></div>
              </div>
              <div className="stack-card stack-3">
                <div className="scn">Maison Verte</div>
                <div className="scd"></div>
                <div className="sct">Architecture &amp; design</div>
                <div className="scm">maison-verte.ca</div>
              </div>
              <div className="stack-card stack-4">
                <div className="scn">Maxime Roy</div>
                <div className="scd"></div>
                <div className="sct">Photographe</div>
              </div>
              <div className="floating-badge b1">★ <strong>0,08 $</strong>/carte à 1 000 u.</div>
              <div className="floating-badge b2">🚚 <strong>UPS Standard</strong> dès 9,10 $</div>
              <div className="floating-badge b3">⚡ Devis en <strong>2 minutes</strong></div>
            </div>
          </section>
      
          {/* Trust bar */}
          <div className="trust-bar">
            <span className="trust-label">★ Carriers</span>
            <div className="trust-logos">
              <span className="trust-logo">UPS</span>
              <span className="trust-logo">FedEx</span>
              <span className="trust-logo">★★★★★ 4,9/5</span>
              <span className="trust-logo">Trustpilot 12k+ avis</span>
              <span className="trust-logo">Stripe</span>
            </div>
          </div>
      
          {/* HOW IT WORKS */}
          <section id="how">
            <div className="section-eyebrow">Comment ça marche</div>
            <h2 className="section-title">Trois étapes, <em>une commande.</em></h2>
            <p className="section-lede">Pas de devis qui prend 48 heures. Pas de minimum absurde. Pas de surprise à la livraison.</p>
            <div className="how-grid">
              <div className="how-card">
                <div className="how-card-num">01</div>
                <h3 className="how-card-title">Configure</h3>
                <p className="how-card-text">Choisis ton produit, ton format, ton papier, ta finition. Notre wizard te guide étape par étape, prix live à chaque clic.</p>
                <div className="how-card-time">2 minutes en moyenne</div>
              </div>
              <div className="how-card">
                <div className="how-card-num">02</div>
                <h3 className="how-card-title">Téléverse</h3>
                <p className="how-card-text">Dépose ton PDF, AI ou PSD. On vérifie bleed, résolution et CMYK automatiquement. Pas de design ? On a des templates.</p>
                <div className="how-card-time">Validation en temps réel</div>
              </div>
              <div className="how-card">
                <div className="how-card-num">03</div>
                <h3 className="how-card-title">Reçois</h3>
                <p className="how-card-text">Paiement Stripe sécurisé. Production démarre dans l'heure. UPS ou FedEx te livre en 1 à 7 jours selon ta sélection.</p>
                <div className="how-card-time">Tracking par courriel</div>
              </div>
            </div>
          </section>
      
          {/* PRODUCTS */}
          <section id="products" className="products-section" style={{ maxWidth: "none", padding: "0", margin: "0" } as React.CSSProperties}>
            <div className="products-section-inner">
              <div className="section-eyebrow">Catalogue</div>
              <h2 className="section-title">Plus de <em>1 200 produits</em> imprimés au Canada.</h2>
              <p className="section-lede">Du basique au spécialité — papier, finition, format, le tout configurable.</p>
              <div className="products-grid">
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><div className="promo-mockup-card gloss"></div></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes de visite UV</div>
                    <div className="product-promo-meta">14pt · brillant · 4/4 couleurs</div>
                  </div>
                  <div className="product-promo-price">à partir de 24,80 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><div className="promo-mockup-card soft"></div></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes Soft Touch</div>
                    <div className="product-promo-meta">18pt · velouté · premium</div>
                  </div>
                  <div className="product-promo-price">à partir de 58,40 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><div className="promo-mockup-card foil"></div></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes Foil métallique</div>
                    <div className="product-promo-meta">or · argent · cuivre</div>
                  </div>
                  <div className="product-promo-price">à partir de 128,00 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><div className="promo-mockup-card matte"></div></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Flyers &amp; dépliants</div>
                    <div className="product-promo-meta">8,5 × 11" · couché mat</div>
                  </div>
                  <div className="product-promo-price">à partir de 38,00 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><div className="promo-mockup-poster"></div></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Bannières grand format</div>
                    <div className="product-promo-meta">vinyle · coroplast · pull-up</div>
                  </div>
                  <div className="product-promo-price">à partir de 45,00 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><div className="promo-mockup-card kraft"></div></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes Kraft (eco)</div>
                    <div className="product-promo-meta">recyclé · 100 % canadien</div>
                  </div>
                  <div className="product-promo-price">à partir de 32,80 $</div>
                </a>
              </div>
            </div>
          </section>
      
          {/* FEATURES */}
          <section>
            <div className="section-eyebrow">Ce qui change</div>
            <h2 className="section-title">Conçu pour les <em>pros pressés.</em></h2>
            <p className="section-lede">Les imprimeurs traditionnels prennent 48h pour un devis. On le donne en 30 secondes.</p>
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon"><svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
                <h3 className="feature-title">Devis instantané</h3>
                <p className="feature-text">Notre engine calcule le prix exact à chaque changement d'option. Pas de "demander un devis" qui prend 2 jours.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div>
                <h3 className="feature-title">Prépresse incluse</h3>
                <p className="feature-text">Notre équipe vérifie ton fichier (bleed, CMYK, fonts, résolution) avant la presse. Inclus dans le prix, pas en sus.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="2" y1="20" x2="22" y2="20" /></svg></div>
                <h3 className="feature-title">Échantillons gratuits</h3>
                <p className="feature-text">Pas sûr du papier ? Demande un échantillon physique de n'importe quel stock — on l'envoie sans frais.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></div>
                <h3 className="feature-title">100 % au Canada</h3>
                <p className="feature-text">Imprimé à Markham, ON. Livré partout au Canada en 1 à 7 jours. Pas de frontière, pas de tarif douanier.</p>
              </div>
            </div>
          </section>
      
          {/* TESTIMONIALS — dynamic depuis DB (revalidate 10min) */}
          <TestimonialsSection />
      
          {/* FAQ */}
          <section id="faq">
            <div className="section-eyebrow">Questions fréquentes</div>
            <h2 className="section-title">Tout ce qu'il faut savoir, <em>avant de commander.</em></h2>
            <div className="faq-list" style={{ marginTop: "48px" } as React.CSSProperties}>
              <div className="faq-item open">
                <div className="faq-q">Combien de temps prend la livraison ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Standard 4-5 jours ouvrables (inclus), Express 2-3 jours (+12 $), Rush 1 jour (+28 $). Toutes les estimations sont calculées depuis Markham (ON) vers ton code postal au moment du devis.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Y a-t-il un minimum de commande ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Non. Tu peux commander 100 cartes ou 10 000 — le prix s'ajuste automatiquement. Plus la quantité monte, plus le coût unitaire descend (voir notre slider en temps réel).</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Quels formats de fichier acceptez-vous ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">PDF, AI, PSD, JPG, PNG, TIFF. Recommandé : PDF 300 DPI en CMYK avec bleed de 0,125". Notre validateur automatique te dit immédiatement si quelque chose cloche.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Et si je n'ai pas de design ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Télécharge nos templates gratuits avec bleed et safe zone déjà configurés. Ou utilise notre éditeur en ligne avec templates, photos stock et génération de logo par IA.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Comment fonctionne le remboursement ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Annulation possible jusqu'au moment où la production démarre (généralement sous 2h). Après production, remplacement gratuit si le fichier validé par notre prépresse n'est pas respecté.</div>
              </div>
              <div className="faq-item">
                <div className="faq-q">Êtes-vous une vraie imprimerie ?<span className="faq-toggle">+</span></div>
                <div className="faq-a">Plio travaille avec une presse wholesale canadienne établie à Markham (ON). On gère ton expérience web, la prépresse et le service client — notre partenaire presse gère la production physique.</div>
              </div>
            </div>
          </section>
      
          {/* FINAL CTA */}
          <div className="final-cta">
            <h2>Prêt à <em>imprimer ?</em></h2>
            <p>Démarre un devis en 30 secondes. Pas de carte de crédit avant le paiement final.</p>
            <a href="/order/start" className="hero-cta-primary">Commencer ma commande →</a>
          </div>
        </main>
      
        <footer>
          <div className="footer-grid">
            <div className="footer-brand">
              <span className="footer-brand-mark">Plio.</span>
              <p className="footer-brand-text">Print wholesale au Canada, devis instantané, livraison partout en 1 à 7 jours. Imprimé à Markham (ON).</p>
              <div style={{ marginTop: 24, maxWidth: 380 }}>
                <NewsletterSignup source="landing-footer" />
              </div>
            </div>
            <div className="footer-col">
              <h4>Produits</h4>
              <ul>
                <li><a href="/order/start">Cartes de visite</a></li>
                <li><a href="/order/start">Flyers</a></li>
                <li><a href="/order/start">Brochures</a></li>
                <li><a href="/order/start">Bannières</a></li>
                <li><a href="/order/start">Apparel</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Aide</h4>
              <ul>
                <li><a href="#faq">FAQ</a></li>
                <li><a href="/track">Suivre une commande</a></li>
                <li><a href="/templates">Templates</a></li>
                <li><a href="/contact">Contact</a></li>
                <li><a href="/about">À propos</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Légal</h4>
              <ul>
                <li><a href="/legal/privacy">Politique de confidentialité</a></li>
                <li><a href="/legal/terms">Conditions d'utilisation</a></li>
                <li><a href="/legal/refund-policy">Politique de remboursement</a></li>
                <li><a href="/contact">Nous contacter</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>★ © Plio 2026 · Imprimé au Canada 🇨🇦</span>
            <span><a href="/legal/privacy" style={{ color: 'inherit' }}>Confidentialité</a> · <a href="/legal/terms" style={{ color: 'inherit' }}>Conditions</a> · <a href="/legal/refund-policy" style={{ color: 'inherit' }}>Remboursement</a></span>
          </div>
        </footer>
    </>
  );
}
