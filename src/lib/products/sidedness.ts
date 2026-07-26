/**
 * Détection recto / recto-verso dans le groupe Sinalite `Stock`.
 *
 * Pour CERTAINS produits (pas tous), Sinalite encode le choix « imprimer
 * 1 face ou 2 » dans le groupe `Stock` — le même groupe qui, pour la
 * plupart des autres produits, désigne le PAPIER (14pt/16pt/kraft…).
 * `ConfigureClient.tsx` traitait `Stock` comme toujours-papier : les deux
 * options recto/recto-verso s'affichaient sous le libellé « Papier », avec
 * la même description générique (« Voir specs détaillées ») pour les deux,
 * et le défaut prenait la première option Sinalite (souvent 1 face) — un
 * client qui a conçu un recto-verso payait alors une impression recto.
 * Cf. docs/experience-client-2026-07.md finding [97]/[10].
 *
 * Conventions Sinalite/industrie couvertes : « 4/0 »/« 4/4 » (CMJN
 * recto/recto-verso), « 1 Sided »/« 2 Sided », « Single/Double Sided »,
 * « One/Two Sided ». Détection VOLONTAIREMENT stricte (toutes les options
 * du groupe doivent matcher) pour ne jamais reclasser un groupe papier réel.
 */

export type Sidedness = 'single' | 'double';

const SINGLE_PATTERNS = [/^\s*4\s*\/\s*0\s*$/i, /single[\s-]?sided/i, /^1\s*sided$/i, /one[\s-]?sided/i];
const DOUBLE_PATTERNS = [/^\s*4\s*\/\s*4\s*$/i, /double[\s-]?sided/i, /^2\s*sided$/i, /two[\s-]?sided/i];

/** Classe UN nom d'option Sinalite, ou `null` si ça ne ressemble pas à un choix de face. */
export function classifySidedness(name: string): Sidedness | null {
  const trimmed = name.trim();
  if (SINGLE_PATTERNS.some((re) => re.test(trimmed))) return 'single';
  if (DOUBLE_PATTERNS.some((re) => re.test(trimmed))) return 'double';
  return null;
}

/**
 * Un groupe `Stock` est un choix de FACE (pas de papier) seulement si
 * TOUTES ses options matchent — sinon on suppose un groupe papier normal
 * et on ne touche à rien (mieux vaut rater un cas que casser un vrai papier).
 */
export function isSidednessGroup(optionNames: string[]): boolean {
  return optionNames.length >= 2 && optionNames.every((n) => classifySidedness(n) !== null);
}

/** Libellé de section quand le groupe est reclassé. */
export const SIDEDNESS_LABEL = 'Impression recto / recto-verso';

/** Description affichée sous chaque option, distincte pour recto vs recto-verso. */
export function sidednessDesc(kind: Sidedness): string {
  return kind === 'double'
    ? 'Imprime le recto ET le verso — utilise le fichier verso téléversé à l\'étape suivante.'
    : 'Imprime seulement le recto — le verso reste blanc, même si un fichier verso est fourni.';
}
