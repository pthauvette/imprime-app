/**
 * Slug stable d'une question FAQ — SOURCE UNIQUE (Round 6 #3).
 *
 * Partagé entre /api/search (qui génère les liens `/help#<slug>`) et HelpSearch
 * (qui pose `id={faqSlug(item.q)}` sur chaque <details> et ouvre/scrolle la
 * cible au chargement via le hash). Les deux DOIVENT produire le même slug,
 * sinon le deep-link search → réponse retombe en haut de /help sans rien ouvrir.
 */
export function faqSlug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
