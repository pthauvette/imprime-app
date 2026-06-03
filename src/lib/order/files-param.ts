/**
 * Sérialisation/désérialisation du paramètre URL `files` du wizard de commande.
 *
 * Format (compatible avec le parsing de /order/review) :
 *   `front:<encodeURIComponent(url)>|back:<encodeURIComponent(url)>`
 *
 * Audit v2 #4.3 — source unique pour : construire le param (upload→shipping) ET
 * le re-parser (réhydratation upload quand on revient via « Précédent »). Avant,
 * le bouton « Précédent » de shipping omettait `&files=` et la page upload ne
 * réhydratait rien → dropzone vide, re-upload forcé juste avant le paiement.
 */

export interface ParsedFiles {
  frontUrl?: string;
  backUrl?: string;
}

export function buildFilesParam(frontUrl?: string | null, backUrl?: string | null): string {
  return [
    frontUrl ? `front:${encodeURIComponent(frontUrl)}` : null,
    backUrl ? `back:${encodeURIComponent(backUrl)}` : null,
  ]
    .filter(Boolean)
    .join('|');
}

export function parseFilesParam(raw: string | null | undefined): ParsedFiles {
  const out: ParsedFiles = {};
  if (!raw) return out;
  for (const part of raw.split('|').filter(Boolean)) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const type = part.slice(0, idx);
    const url = decodeURIComponent(part.slice(idx + 1));
    if (!url) continue;
    if (type === 'front') out.frontUrl = url;
    else if (type === 'back') out.backUrl = url;
  }
  return out;
}
