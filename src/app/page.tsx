/**
 * / — landing page marketing. Server Component avec i18n + onboarding tour.
 */

import NewsletterSignup from '@/components/marketing/NewsletterSignup';
import TestimonialsSection from '@/components/marketing/TestimonialsSection';
import ReviewsWidget from '@/components/marketing/ReviewsWidget';
import LangSwitch from '@/components/i18n/LangSwitch';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';
import ProductMockup from '@/components/wizard/ProductMockup';
import { getServerLocale } from '@/lib/i18n/locale';
import { translate } from '@/lib/i18n/messages';
import { DELIVERY_WINDOW } from '@/lib/content/marketing';
import { getCardStartingPrice } from '@/lib/products/card-price';
import { formatCents, formatNumber } from '@/lib/format';

export const metadata = { title: "Plio — Print wholesale au Canada" };

export default async function LandingPage() {
  // POC i18n : nav + hero CTA traduits server-side via cookie plio_lang.
  // Le reste du contenu marketing reste en FR (migration incrémentale).
  const locale = await getServerLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  // #8.7 — prix vitrine DYNAMIQUE (coût Sinalite + marge admin), plus de
  // « 0,08 $ » figé. Null si Sinalite injoignable (build/CI) → fallback sans
  // chiffre pour ne jamais promettre un tarif inventé.
  const cardPrice = await getCardStartingPrice();
  const fmtLocale = locale === 'en' ? 'en-CA' : 'fr-CA';
  // Round 46 — SÉCURITÉ : la session n'est PLUS résolue côté serveur ici.
  // Rendre session.user.email dans le HTML SSR le faisait fuiter quand le
  // runtime SSR Amplify resservait par intermittence un rendu connecté à une
  // requête anonyme (fuite de PII + mismatch d'hydratation = pastille morte).
  // La pastille est désormais résolue CÔTÉ CLIENT (ClientHeaderUserSlot, qui
  // fetch /api/auth/session avec le cookie du vrai visiteur) → zéro PII en SSR.

  return (
    <>
      {/* Modal d'accueil retiré (nettoyage design 2026-07) : le tour « 👋 Bienvenue »
          lisait comme un onboarding généré. Le composant OnboardingTour reste dans
          le dépôt, simplement plus monté ici — remontage trivial si on le veut. */}

      <nav className="mkt-nav">
          <a href="/" className="mkt-brand">Plio.</a>
          <div className="mkt-nav-links">
            <a href="#products" className="mkt-nav-link">{t('nav.products')}</a>
            <a href="#how" className="mkt-nav-link">{t('nav.howItWorks')}</a>
            <a href="/blog" className="mkt-nav-link">{t('nav.blog')}</a>
            <a href="/order/start" className="mkt-nav-cta">{t('nav.startOrder')} →</a>
            <LangSwitch />
            {/* Pastille user résolue côté client (zéro PII en SSR — cf. note plus haut). */}
            <ClientHeaderUserSlot signInLabel={t('nav.signIn')} />
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
                <span className="hero-trust-item">Prix transparent en temps réel</span>
                <span className="hero-trust-item">100 % imprimé au Canada</span>
              </div>
            </div>
            {/* Audit 2026-07 #7 (a11y) — cartes empilées + badges purement
                décoratifs (noms/coordonnées fictifs). aria-hidden les retire de
                l'arbre d'accessibilité : sinon un lecteur d'écran énonce « Sophie
                Beauchamp… Maison Verte… » avant le vrai contenu (CTA, trust bar). */}
            <div className="hero-visual" aria-hidden="true">
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
              <div className="floating-badge b1">
                {cardPrice
                  ? <><strong>{formatCents(cardPrice.unitPriceCents, fmtLocale)}</strong>/carte à {formatNumber(cardPrice.atQuantity, fmtLocale)} u.</>
                  : <><strong>Prix dégressif</strong> au volume</>}
              </div>
              <div className="floating-badge b2"><strong>UPS Standard</strong> dès 9,10 $</div>
              <div className="floating-badge b3">Devis en <strong>2 minutes</strong></div>
            </div>
          </section>
      
          {/* Trust bar */}
          <div className="trust-bar">
            <span className="trust-label">Transporteurs</span>
            {/* Round 45 #1 — « 4,9/5 » + « Trustpilot 12k+ avis » étaient
                inventés (aucun compte Trustpilot). Retirés ; on garde les
                transporteurs/processeur réels (vrais partenaires) + un fait. */}
            <div className="trust-logos">
              <span className="trust-logo">UPS</span>
              <span className="trust-logo">FedEx</span>
              <span className="trust-logo">Postes Canada</span>
              <span className="trust-logo">Paiement Stripe sécurisé</span>
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
                <p className="how-card-text">Dépose ton PDF, AI ou PSD. On vérifie bleed et résolution automatiquement. Pas de design ? On a des templates.</p>
                <div className="how-card-time">Validation en temps réel</div>
              </div>
              <div className="how-card">
                <div className="how-card-num">03</div>
                <h3 className="how-card-title">Reçois</h3>
                <p className="how-card-text">Paiement Stripe sécurisé. Production lancée dès que ton fichier est validé. UPS ou FedEx te livre en {DELIVERY_WINDOW} selon ta sélection.</p>
                <div className="how-card-time">Tracking par courriel</div>
              </div>
            </div>
          </section>
      
          {/* PRODUCTS */}
          <section id="products" className="products-section" style={{ maxWidth: "none", padding: "0", margin: "0" } as React.CSSProperties}>
            <div className="products-section-inner">
              <div className="section-eyebrow">Catalogue</div>
              <h2 className="section-title">Des <em>centaines de produits</em> imprimés au Canada.</h2>
              <p className="section-lede">Du basique au spécialité — papier, finition, format, le tout configurable.</p>
              <div className="products-grid">
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><ProductMockup shape="card" finish="gloss" title="Cartes de visite UV" /></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes de visite UV</div>
                    <div className="product-promo-meta">14pt · brillant · 4/4 couleurs</div>
                  </div>
                  <div className="product-promo-price">à partir de 24,80 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><ProductMockup shape="card" finish="soft" title="Cartes Soft Touch" /></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes Soft Touch</div>
                    <div className="product-promo-meta">16pt · velouté · premium</div>
                  </div>
                  <div className="product-promo-price">à partir de 58,40 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><ProductMockup shape="card" finish="foil" title="Cartes Foil métallique" /></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Cartes Foil métallique</div>
                    <div className="product-promo-meta">or · argent · cuivre</div>
                  </div>
                  <div className="product-promo-price">à partir de 128,00 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><ProductMockup shape="flyer" finish="matte" title="Flyers et dépliants" /></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Flyers &amp; dépliants</div>
                    <div className="product-promo-meta">8,5 × 11" · couché mat</div>
                  </div>
                  <div className="product-promo-price">à partir de 38,00 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><ProductMockup shape="banner" finish="matte" title="Bannières grand format" /></div>
                  <div className="product-promo-info">
                    <div className="product-promo-name">Bannières grand format</div>
                    <div className="product-promo-meta">vinyle · coroplast · pull-up</div>
                  </div>
                  <div className="product-promo-price">à partir de 45,00 $</div>
                </a>
                <a href="/order/start" className="product-promo">
                  <div className="product-promo-visual"><ProductMockup shape="card" finish="kraft" title="Cartes Kraft eco" /></div>
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
                <h3 className="feature-title">Vérification de fichier incluse</h3>
                <p className="feature-text">Notre système vérifie ton fichier (fond perdu, dimensions, résolution) avant la presse. Inclus dans le prix, pas en sus.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" /></svg></div>
                <h3 className="feature-title">Aucun engagement</h3>
                <p className="feature-text">Configure, compare, ajuste ton devis autant que tu veux. Aucune carte de crédit requise avant le paiement final.</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></div>
                <h3 className="feature-title">100 % au Canada</h3>
                <p className="feature-text">Imprimé à Markham, ON. Livré partout au Canada en {DELIVERY_WINDOW}. Pas de frontière, pas de tarif douanier.</p>
              </div>
            </div>
          </section>
      
          {/* TESTIMONIALS — dynamic depuis DB (revalidate 10min) */}
          <TestimonialsSection />

          {/* Round 22 #4 — Customer reviews (Review.status=APPROVED) */}
          <ReviewsWidget />
      
          {/* FAQ */}
          <section id="faq">
            <div className="section-eyebrow">Questions fréquentes</div>
            <h2 className="section-title">Tout ce qu'il faut savoir, <em>avant de commander.</em></h2>
            <div className="faq-list" style={{ marginTop: "48px" } as React.CSSProperties}>
              <details className="faq-item" open>
                <summary className="faq-q">Combien de temps prend la livraison ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Standard inclus — la plupart des commandes arrivent en {DELIVERY_WINDOW} ouvrables. Express et Rush accélèrent la production : le surcoût exact s'affiche au devis selon le produit. Toutes les estimations sont calculées depuis Markham (ON) vers ton code postal au moment du devis.</div>
              </details>
              <details className="faq-item">
                <summary className="faq-q">Y a-t-il un minimum de commande ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Non. Tu peux commander 100 cartes ou 10 000 — le prix s'ajuste automatiquement. Plus la quantité monte, plus le coût unitaire descend (voir notre slider en temps réel).</div>
              </details>
              <details className="faq-item">
                <summary className="faq-q">Quels formats de fichier acceptez-vous ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">PDF, AI, PSD, JPG, PNG, TIFF. Recommandé : PDF 300 DPI en CMYK avec bleed de 0,125". Notre validateur automatique te dit immédiatement si quelque chose cloche.</div>
              </details>
              <details className="faq-item">
                <summary className="faq-q">Et si je n'ai pas de design ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Télécharge nos templates gratuits avec bleed et safe zone déjà configurés. Ou utilise notre éditeur en ligne pour personnaliser un template directement dans ton navigateur.</div>
              </details>
              <details className="faq-item">
                <summary className="faq-q">Comment fonctionne le remboursement ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Demande l'annulation depuis ton compte tant que la production n'a pas démarré — ça se joue souvent en quelques minutes après le paiement, alors fais vite si besoin ; remboursement complet dans ce cas. Une fois la production lancée, des frais d'annulation s'appliquent (min. 25 $/article). Si le résultat livré ne respecte pas ta configuration, on corrige en réimpression ou en remboursement.</div>
              </details>
              <details className="faq-item">
                <summary className="faq-q">Êtes-vous une vraie imprimerie ?<span className="faq-toggle">+</span></summary>
                <div className="faq-a">Plio travaille avec une presse wholesale canadienne établie à Markham (ON). On gère ton expérience web, la prépresse et le service client — notre partenaire presse gère la production physique.</div>
              </details>
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
              <p className="footer-brand-text">Print wholesale au Canada, devis instantané, livraison partout en {DELIVERY_WINDOW}. Imprimé à Markham (ON).</p>
              <div style={{ marginTop: 24, maxWidth: 380 }}>
                <NewsletterSignup source="landing-footer" />
              </div>
            </div>
            <div className="footer-col">
              <h4>Produits</h4>
              <ul>
                <li><a href="/order/product?category=cartes-de-visite">Cartes de visite</a></li>
                <li><a href="/order/product?category=flyers">Flyers</a></li>
                <li><a href="/order/product?category=brochures">Brochures</a></li>
                <li><a href="/order/product?category=bannieres">Bannières</a></li>
                <li><a href="/order/product?category=etiquettes">Étiquettes &amp; stickers</a></li>
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
            <span>© Plio 2026 · Imprimé au Canada</span>
            <span><a href="/legal/privacy" style={{ color: 'inherit' }}>Confidentialité</a> · <a href="/legal/terms" style={{ color: 'inherit' }}>Conditions</a> · <a href="/legal/refund-policy" style={{ color: 'inherit' }}>Remboursement</a></span>
          </div>
        </footer>
    </>
  );
}
