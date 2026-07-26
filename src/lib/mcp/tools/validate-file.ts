/**
 * MCP tool — `validate_print_file` : préflight d'un fichier print-ready DÉJÀ
 * téléversé sur le stockage Plio (URL S3 `uploads/…`). Réutilise le MÊME cœur de
 * validation que le web (`assessPdfBytes`) côté serveur.
 *
 * SÛRETÉ : read-only, n'écrit RIEN. Le fileUrl passe par `assertPlioFileUrl`
 * (anti-SSRF : doit vivre dans le bucket Plio, préfixe uploads/) AVANT tout fetch
 * — on ne télécharge jamais une URL arbitraire.
 *
 * CE QU'ON VALIDE (PDF) : intégrité/parse, nb de pages, dimensions vs taille
 * typique du produit + bleed. CE QU'ON NE VALIDE PAS (honnêteté) : la COULEUR
 * (CMYK vs RGB) et le DPI des images DANS un PDF — pdf-lib n'expose pas les
 * streams et pdfjs normalise les couleurs en RGB → indétectable de façon fiable
 * sans un outil de preflight lourd. Sinalite valide la couleur/DPI en production
 * (inchangé vs le flux web). Images raster (JPG/PNG/TIFF) : délégué Sinalite ici
 * (le décodage pixel serveur exigerait sharp — non encore câblé).
 */
import { assertPlioFileUrl } from '@/lib/mcp/file-url-guard';
import { assessPdfBytes, isPdfMime, type ValidationIssue, type ValidationLevel } from '@/lib/print/pdf-validator';
import { MARGIN_SPECS_BY_FAMILY } from '@/lib/products/margin-specs';

const MAX_FETCH_BYTES = 150 * 1024 * 1024; // aligné sur la limite S3

export interface ValidatePrintFileResult {
  level: ValidationLevel; // ok | warning | error
  /** true si level === 'error' (fichier à refaire avant de commander). */
  blocking: boolean;
  fileType: 'pdf' | 'image' | 'other';
  issues: ValidationIssue[];
  meta?: {
    pageCount: number;
    firstPageInches: { width: number; height: number };
    firstPageMm: { width: number; height: number };
    sizeBytes: number;
  };
  /** Contrôles NON faits ici, validés par Sinalite à la production. */
  delegatedToSinalite: string[];
}

function errResult(code: string, message: string, fileType: ValidatePrintFileResult['fileType'] = 'other'): ValidatePrintFileResult {
  return { level: 'error', blocking: true, fileType, issues: [{ level: 'error', code, message }], delegatedToSinalite: [] };
}

/** Valide un fichier (URL S3 Plio) pour un produit. read-only. */
export async function validatePrintFile(input: { fileUrl: string; slug?: string }): Promise<ValidatePrintFileResult> {
  const guard = assertPlioFileUrl(input.fileUrl);
  if (!guard.ok) return errResult('bad-file-url', guard.reason);

  let bytes: Uint8Array;
  let contentType = '';
  try {
    const res = await fetch(guard.url);
    if (!res.ok) return errResult('fetch-failed', `Téléchargement du fichier impossible (HTTP ${res.status}).`);
    contentType = res.headers.get('content-type') ?? '';
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len > MAX_FETCH_BYTES) return errResult('file-too-large', `Fichier trop volumineux (${Math.round(len / 1048576)} MB, max 150 MB).`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return errResult('fetch-failed', 'Téléchargement du fichier impossible.');
  }

  const path = guard.url.split('?')[0].toLowerCase();
  const isPdf = isPdfMime(contentType) || path.endsWith('.pdf');
  if (!isPdf) {
    const isImage = contentType.startsWith('image/') || /\.(jpe?g|png|tiff?)$/.test(path);
    return {
      level: 'ok',
      blocking: false,
      fileType: isImage ? 'image' : 'other',
      issues: [],
      delegatedToSinalite: ['dimensions', 'résolution (DPI)', 'couleur (CMYK/RGB)'],
    };
  }

  // Taille attendue = trim typique du produit + bleed (margin-specs). Seulement si le
  // slug a un spec DÉDIÉ (sinon pas de comparaison → évite un faux warning sur défaut).
  const spec = input.slug ? MARGIN_SPECS_BY_FAMILY[input.slug] : undefined;
  const expected = spec
    ? { widthInches: spec.typicalTrim.widthIn, heightInches: spec.typicalTrim.heightIn, bleedInches: spec.bleedInches }
    : undefined;
  // strictDimensions FALSE : on n'a que la taille TYPIQUE (pas la taille exacte choisie)
  // → un écart est un WARNING informatif, jamais un blocage (anti faux-blocage).
  // maxPages : idem web (finding [24]) — un livret vendu 8-64pg ne doit pas se faire
  // avertir « seules les 2 premières seront imprimées ».
  const r = await assessPdfBytes(bytes, { expected, strictDimensions: false, maxPages: spec?.maxPrintPages ?? 2 });
  return {
    level: r.level,
    blocking: r.level === 'error',
    fileType: 'pdf',
    issues: r.issues,
    meta: r.meta
      ? { pageCount: r.meta.pageCount, firstPageInches: r.meta.firstPageInches, firstPageMm: r.meta.firstPageMm, sizeBytes: r.meta.sizeBytes }
      : undefined,
    delegatedToSinalite: ['couleur (CMYK/RGB)', 'DPI des images du PDF', 'polices'],
  };
}

/** Rend le résultat en texte lisible (content du tool MCP). */
export function formatValidatePrintFileText(r: ValidatePrintFileResult): string {
  const lines: string[] = [];
  const head =
    r.level === 'error' ? '❌ Fichier NON conforme — à corriger avant de commander :'
    : r.level === 'warning' ? '⚠️ Fichier acceptable, mais à vérifier :'
    : '✅ Fichier conforme (contrôles de base).';
  lines.push(head);
  for (const i of r.issues) lines.push(`  • ${i.message}`);
  if (r.meta) {
    lines.push(`Dimensions : ${r.meta.firstPageInches.width}" × ${r.meta.firstPageInches.height}" (${r.meta.firstPageMm.width} × ${r.meta.firstPageMm.height} mm) · ${r.meta.pageCount} page(s).`);
  }
  if (r.delegatedToSinalite.length) {
    lines.push(`Non vérifié ici (validé par Plio à la production) : ${r.delegatedToSinalite.join(', ')}.`);
  }
  return lines.join('\n');
}
