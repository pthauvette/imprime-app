/**
 * Génère la version texte brut (fallback) d'un courriel HTML — finding [113].
 *
 * Avant : `html.replace(/<[^>]+>/g, '')` strippait TOUS les tags, y compris
 * `<a href="URL">texte</a>` → seul le texte visible survivait, l'URL était
 * PERDUE. Pour un courriel dont le seul contenu utile est un lien (magic-
 * link, suivi, désabonnement…), la version texte devenait inutilisable dans
 * un client mail texte-seul. Un `.slice(0, 1000)` tronquait ensuite sans
 * égard pour la position du lien, qui pouvait tomber après la coupe.
 *
 * Fix : les liens sont convertis en « texte (URL) » AVANT le strip des tags,
 * donc l'URL survit peu importe où le lien tombe dans le HTML. Plafond relevé
 * à 5000 caractères — un garde-fou contre un HTML pathologique, pas une
 * troncature de routine (le texte réel d'un courriel Plio, une fois les tags
 * retirés, dépasse rarement 1-2 Ko).
 */

const MAX_TEXT_LENGTH = 5000;

export function htmlToPlainText(html: string): string {
  const withLinks = html.replace(
    /<a\s+[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis,
    (_match, href: string, label: string) => {
      const plainLabel = label.replace(/<[^>]+>/g, '').trim();
      return plainLabel && plainLabel !== href ? `${plainLabel} (${href})` : href;
    },
  );
  return withLinks
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}
