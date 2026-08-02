/**
 * Normalisation et validation des numéros de téléphone pour l'auth par SMS.
 *
 * PÉRIMÈTRE VOLONTAIREMENT ÉTROIT — Canada / +1 uniquement (décision Patrick,
 * 2026-08). Plio n'imprime et ne livre qu'au Canada : aucun client légitime
 * n'est exclu, et ça supprime la quasi-totalité du « SMS pumping » (fraude qui
 * déclenche des envois vers des numéros premium étrangers, facturés à Plio).
 * C'est la protection la PLUS efficace du lot, avant même la limitation de
 * débit — elle réduit la surface au lieu de la borner.
 *
 * Pas de dépendance type `libphonenumber-js` (~150 ko) : le plan de numérotation
 * nord-américain (NANP) tient en quelques règles, et on n'a pas besoin de
 * couvrir 200 pays pour en accepter un seul.
 */

/** Numéro au format E.164 (`+15145550123`) — la seule forme stockée/transmise. */
export type E164 = string;

/**
 * Indicatifs régionaux CANADIENS (NANP). Les États-Unis partagent le `+1`, donc
 * filtrer sur « +1 » ne suffit PAS à rester au Canada : sans cette liste, tout
 * numéro américain passerait. Source : Administrateur de la numérotation
 * canadienne. À compléter si l'ARCEP canadienne en ouvre un nouveau (rare —
 * dernier ajout notable : 354 en 2023 pour l'Ontario).
 */
const INDICATIFS_CANADIENS = new Set([
  // Alberta
  '368', '403', '587', '780', '825',
  // Colombie-Britannique
  '236', '250', '257', '604', '672', '778',
  // Manitoba
  '204', '431', '584',
  // Nouveau-Brunswick
  '428', '506',
  // Terre-Neuve-et-Labrador
  '709', '879',
  // Nouvelle-Écosse / Î.-P.-É.
  '782', '902',
  // Territoires (T.N.-O., Nunavut, Yukon)
  '867',
  // Ontario
  '226', '249', '289', '343', '365', '382', '387', '416', '437', '519', '548',
  '613', '647', '683', '705', '742', '753', '807', '905',
  // Québec
  '263', '354', '367', '418', '438', '450', '468', '514', '579', '581', '819', '873',
  // Saskatchewan
  '306', '474', '639',
]);

export type ResultatNumero =
  | { ok: true; e164: E164 }
  | { ok: false; raison: 'vide' | 'format' | 'hors_canada' };

/**
 * Normalise une saisie libre en E.164, ou explique le refus.
 *
 * Accepte les formes courantes au Québec — « 514 555-0123 »,
 * « (514) 555-0123 », « 1-514-555-0123 », « +1 514 555 0123 » — parce qu'un
 * client ne devrait pas avoir à deviner un format. Tout le reste est refusé
 * plutôt que « réparé » : deviner l'intention derrière un numéro mal formé,
 * c'est risquer d'envoyer un code à un tiers.
 */
export function normaliserNumero(saisie: string): ResultatNumero {
  const brut = (saisie ?? '').trim();
  if (!brut) return { ok: false, raison: 'vide' };

  // On ne garde que les chiffres — les `+`, espaces, tirets et parenthèses
  // n'ont aucune valeur sémantique une fois l'indicatif pays identifié.
  const chiffres = brut.replace(/\D/g, '');

  // 10 chiffres = numéro national (indicatif régional + abonné).
  // 11 chiffres commençant par 1 = même chose, avec l'indicatif pays.
  let national: string;
  if (chiffres.length === 10) national = chiffres;
  else if (chiffres.length === 11 && chiffres.startsWith('1')) national = chiffres.slice(1);
  else return { ok: false, raison: 'format' };

  const indicatif = national.slice(0, 3);
  const central = national.slice(3, 6);

  // Règles NANP : l'indicatif régional et le central commencent par 2-9.
  // Écarte « 0… » / « 1… », qui ne sont jamais des numéros composables.
  if (!/^[2-9]/.test(indicatif) || !/^[2-9]/.test(central)) {
    return { ok: false, raison: 'format' };
  }

  if (!INDICATIFS_CANADIENS.has(indicatif)) {
    return { ok: false, raison: 'hors_canada' };
  }

  return { ok: true, e164: `+1${national}` };
}

/** Message destiné au CLIENT — jamais de détail technique. */
export function messageRefus(raison: Exclude<ResultatNumero, { ok: true }>['raison']): string {
  switch (raison) {
    case 'vide':
      return 'Entre ton numéro de téléphone.';
    case 'hors_canada':
      return 'On accepte les numéros canadiens seulement — utilise plutôt le lien par courriel.';
    case 'format':
    default:
      return 'Ce numéro ne semble pas valide. Format attendu : 514 555-0123.';
  }
}

/**
 * Masque un numéro pour les LOGS et l'affichage de confirmation.
 * `+15145550123` → `••• ••• 0123`. Un numéro complet est une donnée
 * personnelle (Loi 25) et n'a rien à faire dans CloudWatch.
 */
export function masquerNumero(e164: E164): string {
  const quatre = e164.slice(-4);
  return `••• ••• ${quatre}`;
}
