/**
 * Registry des articles de blog.
 *
 * Approche zero-dep : chaque post est un module TypeScript dans
 * src/content/blog/<slug>.tsx qui exporte `meta` + un default `Post`
 * component. On les importe statiquement ici pour avoir un index
 * type-safe disponible pour /blog (liste), /blog/[slug] (render),
 * sitemap.ts (URLs) et /feed.xml (RSS).
 *
 * Pas de bundle markdown parser, pas de filesystem walk au runtime,
 * pas de revalidate cache à manager. Build-time c'est juste des imports.
 *
 * Pour ajouter un post : créer src/content/blog/<slug>.tsx avec une
 * export `meta` et un default component, puis l'enregistrer ci-dessous.
 */

import * as commentChoisirPapier from '@/content/blog/comment-choisir-papier';
import * as quantitesIdealesCartes from '@/content/blog/quantites-ideales-cartes';
import * as formatsStandardsCartes from '@/content/blog/formats-standards-cartes';
import * as preparerFichierImpression from '@/content/blog/preparer-fichier-impression-pdf';
import * as flyersMarketingLocal from '@/content/blog/flyers-marketing-local';
import * as livraisonImpressionCanada from '@/content/blog/livraison-impression-canada-delais';
import * as brochuresPliees from '@/content/blog/brochures-pliees-types';
import * as postcardsMarketing from '@/content/blog/postcards-marketing-direct';
import * as ecoPrinting from '@/content/blog/eco-printing-papiers-recycles';
import * as brandingCoherence from '@/content/blog/branding-coherence-imprimes';
import * as calculerPrixImpression from '@/content/blog/calculer-prix-impression-marge';

export interface PostMeta {
  slug: string;
  title: string;
  /** 1-line résumé pour la liste + meta description. */
  excerpt: string;
  /** ISO date format YYYY-MM-DD. Sera parsée en Date. */
  date: string;
  /** Author display name. */
  author: string;
  /** Optional tags pour le filtering/groupement (MVP : juste pour display). */
  tags?: string[];
  /** Reading time estimé en minutes (manuel à l'écriture). */
  readingMinutes?: number;
}

export interface BlogPost {
  meta: PostMeta;
  Component: React.ComponentType;
}

// Registry. L'ordre dans le array n'importe pas — on tri par date au lookup.
const POSTS: BlogPost[] = [
  { meta: commentChoisirPapier.meta, Component: commentChoisirPapier.default },
  { meta: quantitesIdealesCartes.meta, Component: quantitesIdealesCartes.default },
  { meta: formatsStandardsCartes.meta, Component: formatsStandardsCartes.default },
  { meta: preparerFichierImpression.meta, Component: preparerFichierImpression.default },
  { meta: flyersMarketingLocal.meta, Component: flyersMarketingLocal.default },
  { meta: livraisonImpressionCanada.meta, Component: livraisonImpressionCanada.default },
  { meta: brochuresPliees.meta, Component: brochuresPliees.default },
  { meta: postcardsMarketing.meta, Component: postcardsMarketing.default },
  { meta: ecoPrinting.meta, Component: ecoPrinting.default },
  { meta: brandingCoherence.meta, Component: brandingCoherence.default },
  { meta: calculerPrixImpression.meta, Component: calculerPrixImpression.default },
];

/** Tous les posts, triés date desc. */
export function getAllPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => b.meta.date.localeCompare(a.meta.date));
}

/** Lookup par slug. Retourne undefined si pas trouvé (le caller doit 404). */
export function getPostBySlug(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.meta.slug === slug);
}

/** Helper format date FR-CA pour affichage cohérent. */
export function formatPostDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}
