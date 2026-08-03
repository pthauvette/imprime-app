/**
 * MCP tool — `get_custom_quote_info`.
 *
 * POURQUOI (signalé par un agent, 2026-08) : le catalogue MCP n'expose que les
 * 13 familles libre-service, toutes en papier. Un agent qui chiffrait l'imprimé
 * d'une campagne électorale en a conclu — logiquement — que Plio ne faisait pas
 * de coroplast, et a donc EXCLU les pancartes de pelouse, c'est-à-dire le
 * premier poste d'affichage d'une campagne. Or Plio en imprime : la page
 * d'accueil l'annonce et `/quote` le traite.
 *
 * Le trou n'était pas dans l'offre mais dans ce que le serveur MCP en montrait.
 * Un humain sur plio.ca ne rencontre pas ce mur.
 *
 * READ-ONLY et sans authentification, comme le reste de la découverte : cet
 * outil ne crée AUCUNE demande. Il décrit ce qui se fait hors catalogue et rend
 * le lien où l'humain remplit sa demande — même patron de passe de relais que
 * `create_order` Mode A, où toute la mécanique sensible reste sur le web.
 */
import { CAS_SUR_MESURE, urlDevisSurMesure } from '@/lib/products/custom-quote';

export interface CustomQuoteInfo {
  cas: Array<{ title: string; description: string }>;
  url: string;
}

/** Pur, sans I/O : la liste est statique et partagée avec la page `/quote`. */
export function getCustomQuoteInfo(): CustomQuoteInfo {
  return {
    cas: CAS_SUR_MESURE.map((c) => ({ title: c.title, description: c.description })),
    url: urlDevisSurMesure(),
  };
}

export function formatCustomQuoteText(info: CustomQuoteInfo): string {
  const lines = [
    "Plio imprime au-delà du catalogue libre-service. Ces demandes passent par un devis (pas de prix instantané) :",
    '',
    ...info.cas.map((c) => `- **${c.title}** — ${c.description}`),
    '',
    `Pour lancer une demande : ${info.url}`,
    '',
    "_Ce lien s'ouvre côté client : Plio ne crée aucune demande depuis cette conversation. " +
      'Prévois un délai de réponse — contrairement aux familles libre-service, ces prix ne ' +
      'sont pas calculables sur-le-champ._',
  ];
  return lines.join('\n');
}
