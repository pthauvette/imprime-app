/**
 * Familles imprimées par Plio HORS catalogue libre-service, servies par devis
 * sur mesure (`/quote`).
 *
 * Extrait de `app/quote/page.tsx` (2026-08) pour que la page ET le serveur MCP
 * lisent la MÊME liste. Motif : le catalogue MCP n'expose que les 13 familles
 * papier, si bien qu'un agent concluait « Plio ne fait pas de coroplast » —
 * alors que la page d'accueil l'annonce et que `/quote` le traite. Une lacune
 * du CATALOGUE prise pour une lacune de l'OFFRE.
 *
 * Toute famille ajoutée ici apparaît des deux côtés d'un coup.
 */

import type { IconName } from '@/components/ui/Icon';

export interface CasSurMesure {
  icon: IconName;
  title: string;
  description: string;
}

export const CAS_SUR_MESURE: CasSurMesure[] = [
  {
    icon: 'package',
    title: 'Quantité hors barème',
    description: '10 000+ cartes, 50 000+ flyers, runs très spécifiques avec mix multiple.',
  },
  {
    icon: 'edit',
    title: 'Papier ou finition unique',
    description: 'Embossage, foil stamping, papier coton ou recyclé spécifique, vernis sélectif.',
  },
  {
    icon: 'clipboard',
    title: 'Signage ou substrats rigides',
    description: 'Foamcore, dibond, coroplast, bannières grand format, présentoirs en boutique.',
  },
  {
    icon: 'gift',
    title: 'Packaging et kits',
    description: 'Boîtes pliantes custom, étiquettes adhésives, kits de bienvenue assemblés.',
  },
  {
    icon: 'file',
    title: 'Édition et magazines',
    description: 'Brochures dos carré collé, magazines piqués, catalogues à pagination élevée.',
  },
  {
    icon: 'user',
    title: 'Reseller avec besoin spécial',
    description: 'Si tu es déjà reseller et que ton client veut quelque chose hors catalogue.',
  },
];

/** Où l'humain finalise — le MCP ne fait que la passe (même patron que Mode A). */
export function urlDevisSurMesure(): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.plio.ca').replace(/\/+$/, '');
  return `${base}/quote`;
}
