/**
 * Revalidation SERVEUR des fichiers print d'une commande — backstop contre le
 * contournement du contrôle CLIENT (le web/MCP valide avant l'upload, mais rien
 * n'empêchait un client trafiqué de POSTer /api/orders/create avec une URL de
 * fichier non conforme).
 *
 * Réutilise EXACTEMENT le même cœur que le web et l'outil MCP (`validatePrintFile`
 * → `assessPdfBytes`). Deux principes de sûreté :
 *
 *  1. Fail-CLOSED sur le CONTENU confirmé (PDF corrompu/chiffré, trop peu de pages) :
 *     ces fichiers échoueraient de toute façon à la production Sinalite.
 *  2. Fail-OPEN sur l'INFRASTRUCTURE (`fetch-failed` : S3 indisponible) — un hoquet
 *     réseau ne doit JAMAIS bloquer un paiement. Le fichier reste référencé sur
 *     l'Order ; s'il manque vraiment, la soumission Sinalite échouera plus tard.
 *
 * On NE bloque PAS sur les dimensions : `validatePrintFile` n'a que la taille
 * TYPIQUE de la famille (pas la taille exacte choisie) → un écart est un WARNING,
 * pas une erreur (anti faux-blocage, cohérent avec l'outil MCP).
 *
 * Rollout calqué sur ENFORCE_SHIPPING_SIG : flag `FILE_REVALIDATION` à 3 états —
 * `off` (défaut, inerte : aucune latence ni blocage), `log` (mesure en prod sans
 * bloquer), `enforce` (refuse 422). On passe off → log → enforce après vérif des
 * logs CloudWatch.
 */
import { validatePrintFile } from '@/lib/mcp/tools/validate-file';
import { virtualSlugForProductId } from '@/lib/products/virtual-products';
import type { ValidationIssue, ValidationLevel } from '@/lib/print/pdf-validator';

/** Codes d'INFRASTRUCTURE (hors de la responsabilité du fichier) → fail-open. */
const INFRA_CODES = new Set(['fetch-failed']);

export interface FileCheckOutcome {
  url: string;
  productId: number;
  level: ValidationLevel;
  /** true = erreur de CONTENU confirmée (corrompu/chiffré/pages) → refuser si enforce.
   *  Un échec d'infra (fetch S3) reste false (fail-open). */
  blocking: boolean;
  issues: ValidationIssue[];
}

/**
 * Revalide tous les fichiers de tous les items (en parallèle). Renvoie un
 * outcome par fichier ; le caller décide de logger / bloquer selon le mode.
 */
export async function revalidatePrintFiles(
  items: { productId: number; files: { url: string }[] }[],
): Promise<FileCheckOutcome[]> {
  return Promise.all(
    items.flatMap((it) =>
      it.files.map(async (f): Promise<FileCheckOutcome> => {
        const r = await validatePrintFile({ fileUrl: f.url, slug: virtualSlugForProductId(it.productId) });
        // Un résultat dont TOUTES les issues sont des codes d'infra = fail-open.
        const isInfra = r.issues.length > 0 && r.issues.every((i) => INFRA_CODES.has(i.code));
        return {
          url: f.url,
          productId: it.productId,
          level: r.level,
          blocking: r.blocking && !isInfra,
          issues: r.issues,
        };
      }),
    ),
  );
}
