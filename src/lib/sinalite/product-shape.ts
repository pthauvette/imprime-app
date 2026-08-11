/**
 * Détection de la forme de données d'un produit Sinalite.
 *
 * POURQUOI (2026-08-10, trouvé en lisant `tutorial.php` du portail fournisseur).
 * Sinalite sert DEUX structures incompatibles sous le même endpoint
 * `/product/{id}/{storeCode}`, et rien dans la liste des produits ne permet de
 * les distinguer à l'avance :
 *
 *   produit 1 (carte)      → { id, group, name, hidden }
 *   produit 7028 (rouleau) → { name, label, option_id, html_type, opt_val_id,
 *                              option_val, img_src, extra_turnaround_days, … }
 *
 * Mesuré en direct sur l'API, pas déduit de la doc. Pour les étiquettes en
 * rouleau, le 2ᵉ tableau contient des EXCLUSIONS d'options et le 3ᵉ du contenu
 * éditorial — là où nous attendons `[options, pricing, metadata]`. La doc
 * précise en outre que leur prix NE PEUT PAS se construire localement et que
 * `POST /price` veut un objet nommé (`shape`, `width`, `wind`, `perforation`…)
 * plutôt qu'un tableau d'identifiants.
 *
 * CE QUE ÇA DONNAIT AU CLIENT. `7028`, `7029` et `7030` sont au catalogue avec
 * des noms marketing français curatés. `/api/products/7028` répondait 502, et
 * le configurateur affichait « Service temporairement indisponible — notre
 * équipe a été notifiée ». Trois mensonges : ce n'est ni temporaire, ni un
 * souci passager, et personne n'était notifié de façon actionnable.
 *
 * ⚠️ CE MODULE NE FILTRE PAS LE CATALOGUE, ET C'EST UNE LIMITE ASSUMÉE.
 * `/order/product` liste via `listProducts()` sans jamais demander le détail de
 * chaque produit : écarter à la volée coûterait un appel par produit à chaque
 * affichage. Le garde DÉTECTE et ALERTE avec l'id ; le retrait du catalogue
 * passe par `ProductOverride.disabled` (admin), qui est déjà le mécanisme
 * prévu et reste réversible en deux clics.
 */

/** Clés qui n'existent QUE dans la forme « étiquette en rouleau ». */
const MARQUEURS_ROULEAU = ['option_val', 'html_type', 'opt_val_id'] as const;

/** Clés de la forme standard, celle que tout le reste du code attend. */
const MARQUEURS_STANDARD = ['group'] as const;

export type FormeProduit = 'standard' | 'rouleau' | 'inconnue';

/**
 * Identifie la forme à partir de la RÉPONSE BRUTE de
 * `/product/{id}/{storeCode}`, avant tout parsing Zod — c'est justement le
 * parsing qui échoue sur la forme rouleau.
 *
 * Ne lève jamais : une entrée aberrante donne `'inconnue'`, ce qui est le
 * signal utile. Un garde qui plante ne garde rien.
 */
export function detecterFormeProduit(brut: unknown): FormeProduit {
  if (!Array.isArray(brut) || !Array.isArray(brut[0])) return 'inconnue';
  const premiere = brut[0][0];
  if (premiere === null || typeof premiere !== 'object') return 'inconnue';

  const cles = Object.keys(premiere as Record<string, unknown>);
  if (MARQUEURS_ROULEAU.some((k) => cles.includes(k))) return 'rouleau';
  if (MARQUEURS_STANDARD.every((k) => cles.includes(k))) return 'standard';
  return 'inconnue';
}

/**
 * Erreur typée — distincte d'une panne réseau ou d'un 5xx fournisseur.
 *
 * La distinction porte tout le sens : « Sinalite est tombé » se réessaie,
 * « ce produit a une structure qu'on ne sait pas lire » ne se réessaiera
 * jamais avec succès. Confondre les deux, c'est exactement le message
 * « temporairement indisponible » qu'on vient de retirer.
 */
export class FormeProduitNonSupportee extends Error {
  readonly productId: number;
  readonly forme: FormeProduit;

  constructor(productId: number, forme: FormeProduit) {
    super(
      `Produit ${productId} : structure d'options « ${forme} » non supportée. ` +
        'Ce produit ne peut pas être configuré en ligne et doit être masqué du ' +
        'catalogue (ProductOverride.disabled) ou faire l’objet d’un devis sur mesure.',
    );
    this.name = 'FormeProduitNonSupportee';
    this.productId = productId;
    this.forme = forme;
  }
}
