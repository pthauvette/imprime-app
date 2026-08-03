/**
 * Sauvegarde de configuration mise EN ATTENTE le temps de se connecter.
 *
 * POURQUOI : « Sauvegarder » exige une session. Quand elle manque, le bouton
 * renvoyait vers `/sign-in` et **la configuration était perdue** — aucun
 * brouillon, aucun rejeu au retour. Le client avait choisi son format, son
 * papier, sa quantité, tapé un nom, et retrouvait une page vierge. Rien ne
 * l'avertissait : il pouvait légitimement croire avoir sauvegardé. C'est
 * l'explication la plus plausible d'un export de configurations vide.
 *
 * `localStorage` et NON `sessionStorage` : le lien magique par courriel ouvre
 * souvent un NOUVEL onglet, où `sessionStorage` n'existe pas. Même support que
 * le panier (`plio.cart.v1`), qui a le même besoin de survivre au détour par la
 * connexion.
 *
 * Aucune donnée personnelle : identifiants de produit et d'options, plus le nom
 * que le client a tapé. TTL court quand même — une intention de sauvegarde
 * vieille d'une heure n'en est plus une, et on ne veut pas rejouer un jour une
 * action que l'utilisateur a oubliée.
 */

const CLE = 'plio.saveConfig.pending.v1';
const TTL_MS = 30 * 60 * 1000;

export interface SauvegardeEnAttente {
  name: string;
  productId: number;
  productName: string;
  optionIds: number[];
  summary: string;
  /** Horodatage de la mise en attente (ms epoch). */
  at: number;
}

/** Validation STRICTE : une entrée corrompue ne doit jamais partir en POST. */
function estValide(v: unknown): v is SauvegardeEnAttente {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === 'string' && o.name.trim().length > 0 &&
    typeof o.productId === 'number' && Number.isFinite(o.productId) &&
    typeof o.productName === 'string' &&
    Array.isArray(o.optionIds) && o.optionIds.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    typeof o.summary === 'string' &&
    typeof o.at === 'number' && Number.isFinite(o.at)
  );
}

/** Un seul créneau : la dernière intention l'emporte. Silencieux si le stockage
 *  est indisponible (navigation privée) — mieux vaut perdre le rejeu que planter
 *  le bouton. */
export function mettreEnAttente(
  entree: Omit<SauvegardeEnAttente, 'at'>,
  maintenant: number,
): void {
  try {
    localStorage.setItem(CLE, JSON.stringify({ ...entree, at: maintenant }));
  } catch {
    /* stockage indisponible → pas de rejeu, le reste du parcours est intact */
  }
}

/**
 * Rend l'entrée en attente SI elle concerne ce produit et n'a pas expiré.
 * Une entrée expirée ou d'un autre produit est laissée telle quelle : le client
 * peut être revenu par un autre chemin et vouloir la reprendre ailleurs.
 */
export function lireEnAttente(productId: number, maintenant: number): SauvegardeEnAttente | null {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const v: unknown = JSON.parse(brut);
    if (!estValide(v)) return null;
    if (maintenant - v.at > TTL_MS) return null;
    if (v.productId !== productId) return null;
    return v;
  } catch {
    return null;
  }
}

export function viderEnAttente(): void {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* idem */
  }
}

/**
 * URL de retour après connexion, AVEC la configuration.
 *
 * `/order/configure` sait déjà relire `?options=ID1,ID2` (chemin du réachat) —
 * ça n'avait simplement jamais été branché ici. Sans ces identifiants, le client
 * revenait sur la sélection PAR DÉFAUT : même en rejouant la sauvegarde, il
 * aurait vu à l'écran une configuration différente de celle qu'il venait
 * d'enregistrer.
 */
export function urlDeRetour(
  cheminActuel: string,
  recherche: string,
  productId: number,
  optionIds: number[],
): string {
  const params = new URLSearchParams(recherche);
  params.set('productId', String(productId));
  if (optionIds.length > 0) params.set('options', optionIds.join(','));
  return `${cheminActuel}?${params.toString()}`;
}
