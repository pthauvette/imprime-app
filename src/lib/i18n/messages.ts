/**
 * Messages i18n type-safe pour Plio.
 *
 * Approche zero-dep : un objet par locale, indexé par clé (dot-notation).
 * Pas de next-intl ni de react-intl — c'est ~100 lignes de code et le
 * routing reste à 1 seule version d'URL. Locale choisie via cookie
 * plio_lang (read côté server + client).
 *
 * Ajouter une chaîne : étendre les 2 maps fr + en. TS impose que toutes
 * les clés FR existent en EN (via le type Messages).
 *
 * Pour les pages pas encore migrées : keep les strings hardcodés en FR,
 * migrer une page à la fois. Pas de cassage progressive.
 */

export type Locale = 'fr' | 'en';

export const DEFAULT_LOCALE: Locale = 'fr';
export const ALL_LOCALES: Locale[] = ['fr', 'en'];

/**
 * Round 8 #1 — le switch FR/EN public est MASQUÉ tant que la couverture i18n
 * est insuffisante. Aujourd'hui seuls le nav/hero de la home passent par
 * translate() ; footer, funnel /order/*, compte, admin et pages legal restent
 * en FR dur (~18% de couverture). Exposer un toggle qui ne traduit presque
 * rien = fausse promesse de bilinguisme sur un marché B2B canadien → pire que
 * pas de toggle. L'infra (messages/translate/cookie) reste en place : passer ce
 * flag à `true` quand l'extraction EN aura été faite (footer → funnel → pages
 * publiques). LangSwitch retourne null tant que c'est false.
 */
export const I18N_SWITCH_ENABLED: boolean = false;

const fr = {
  // ─── Marketing nav ────────────────────────────────────────────────────
  'nav.products': 'Produits',
  'nav.howItWorks': 'Comment ça marche',
  'nav.pricing': 'Tarifs',
  'nav.blog': 'Blog',
  'nav.signIn': 'Se connecter',
  'nav.startOrder': 'Commander',

  // ─── Hero ────────────────────────────────────────────────────────────
  'hero.eyebrow': 'Print wholesale, livré au Canada',
  'hero.title': 'Imprime tes cartes, flyers, brochures.',
  'hero.subtitle': 'Prix wholesale sans abonnement. Livraison 4-7 jours partout au Canada.',
  'hero.cta.primary': 'Démarrer une commande',
  'hero.cta.secondary': 'Voir les produits',

  // ─── Footer ──────────────────────────────────────────────────────────
  'footer.tagline': 'Print wholesale, fait au Canada.',
  'footer.copyright': 'Tous droits réservés.',

  // ─── Lang switcher ───────────────────────────────────────────────────
  'lang.fr': 'Français',
  'lang.en': 'English',
  'lang.switchTo': 'Switch language',
};

const en: typeof fr = {
  // ─── Marketing nav ────────────────────────────────────────────────────
  'nav.products': 'Products',
  'nav.howItWorks': 'How it works',
  'nav.pricing': 'Pricing',
  'nav.blog': 'Blog',
  'nav.signIn': 'Sign in',
  'nav.startOrder': 'Start order',

  // ─── Hero ────────────────────────────────────────────────────────────
  'hero.eyebrow': 'Wholesale printing, delivered in Canada',
  'hero.title': 'Print your cards, flyers, brochures.',
  'hero.subtitle': 'Wholesale prices, no subscription. Delivery 4-7 days anywhere in Canada.',
  'hero.cta.primary': 'Start an order',
  'hero.cta.secondary': 'Browse products',

  // ─── Footer ──────────────────────────────────────────────────────────
  'footer.tagline': 'Wholesale printing, made in Canada.',
  'footer.copyright': 'All rights reserved.',

  // ─── Lang switcher ───────────────────────────────────────────────────
  'lang.fr': 'Français',
  'lang.en': 'English',
  'lang.switchTo': 'Switch language',
};

export type Messages = typeof fr;
export type MessageKey = keyof Messages;

const MESSAGES: Record<Locale, Messages> = { fr, en };

/**
 * Traduit une clé pour la locale donnée. Si la clé n'existe pas (jamais
 * en TS, mais runtime guard pour sécurité), retourne la clé elle-même
 * pour signaler visuellement la chaîne manquante.
 */
export function translate(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key] ?? key;
}
