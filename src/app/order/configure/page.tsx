/**
 * /order/configure?productId=N — Step 3 wizard : configuration.
 *
 * Server Component: fetch produit + détails + group options par `group`,
 * pré-calcule la sélection par défaut (lowest qty + first of each), puis
 * délègue à <ConfigureClient /> pour l'interactivité.
 */

import { notFound } from 'next/navigation';
import { z } from 'zod';
import { sinalite } from '@/lib/sinalite/client';
import { getEnrichedVariantIndex } from '@/lib/products/pricing';
import ConfigureClient from '@/components/wizard/ConfigureClient';
import type { SinaliteOption } from '@/lib/sinalite/types';
import JsonLd, { breadcrumbSchema, productSchema } from '@/components/seo/JsonLd';
import { logSinalite } from '@/lib/logger';
import { sendCriticalAlert } from '@/lib/alerting/slack';
import { isSidednessGroup, classifySidedness } from '@/lib/products/sidedness';
import { buildVariantSlice } from '@/lib/products/variant-slice';
import { pickDefaultQuantityOption } from '@/lib/products/default-quantity';
import { applyProductOverrides } from '@/lib/products/overrides';

export const metadata = { title: "Configure ta commande" };
export const dynamic = 'force-dynamic';

const ParamsSchema = z.object({
  productId: z.string().regex(/^\d+$/).transform(Number),
});

export default async function ConfigurePage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; designId?: string; options?: string; files?: string }>;
}) {
  const params = await searchParams;
  const parsed = ParamsSchema.safeParse(params);
  if (!parsed.success) notFound();

  const { productId } = parsed.data;
  const designId = params.designId ?? null;
  // Round-trip upload↔configure : le client a pu déjà téléverser recto/verso
  // avant de revenir ajuster une option. Sans ce paramètre porté à l'aller
  // ET au retour, `?files=` (upload/page.tsx) se perdait au clic « Précédent »
  // et forçait un re-téléversement. Cf. docs/experience-client-2026-07.md [27].
  const filesParam = params.files ?? '';

  let rawProduct, detail, enrichedIndex;
  try {
    [rawProduct, detail, enrichedIndex] = await Promise.all([
      sinalite.getProduct(productId),
      sinalite.getProductDetail(productId),
      getEnrichedVariantIndex(productId),
    ]);
  } catch (err) {
    // Round 37 #2 — Avant : `catch { notFound() }` silencieux masquait
    // les vrais errors (timeout Sinalite, auth fail) en "Page not found".
    // Customer abandonnait, admin n'avait aucune visibilité.
    //
    // Maintenant : on log + alert Slack (throttled par les helpers downstream)
    // puis re-throw. error.tsx render proper "service temporairement
    // indisponible" et customer comprend que ce n'est pas une URL invalide.
    //
    // Edge case : si le productId est vraiment invalide (404 Sinalite legit
    // pour ce specific ID), le err.statusCode === 404 — on retombe à
    // notFound() dans ce cas-là uniquement.
    const isNotFound = err instanceof Error &&
      'statusCode' in err && (err as { statusCode?: number }).statusCode === 404;
    if (isNotFound) {
      notFound();
    }
    logSinalite.error(
      { err, productId },
      'sinalite fetch failed on /order/configure — render error.tsx',
    );
    await sendCriticalAlert({
      severity: 'warning',
      title: 'Sinalite fetch failed on /order/configure',
      body: `Product ${productId} fetch failed. Customer redirected to error page. Investigue.`,
      context: { productId, error: err instanceof Error ? err.message : 'unknown' },
    });
    throw err; // → error.tsx (Next.js boundary)
  }

  // finding UI/UX 2026-08 — le picker (/order/product) applique déjà
  // ProductOverride.displayName (cf. applyProductOverrides), mais cette page
  // utilisait le nom Sinalite BRUT sans override : un nom interne comme
  // « Business cards 14pt (Profit Maximizer) » pouvait fuiter jusqu'au
  // customer dès qu'il atteignait /order/configure (breadcrumb, éyebrow),
  // même reçu via le flow produit VIRTUEL déjà « propre » (/order/v/<slug>).
  const [product] = await applyProductOverrides([rawProduct]);

  const hiddenOptionIds = enrichedIndex.hiddenOptionIds;

  // Group options by `group` field, en filtrant celles cachées par l'admin
  // (ProductOverride.hiddenOptionIds). Cohérent avec QuantityClient qui
  // applique le même filtre.
  const optionGroups: Record<string, SinaliteOption[]> = {};
  for (const opt of detail.options) {
    if (hiddenOptionIds.has(opt.id)) continue;
    (optionGroups[opt.group] ??= []).push(opt);
  }

  // Parse les options pré-sélectionnées depuis l'URL (flow reorder).
  // Format : ?options=ID1,ID2,ID3 — on map chaque ID vers son groupe.
  // Si un ID n'existe pas dans ce produit (ex: produit a changé de SKUs),
  // on l'ignore silencieusement et le default kicks in.
  const prefilledOptionIds = new Set<number>(
    (params.options ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  // Default combo: first of chaque groupe + une qty « populaire » par défaut,
  // MAIS si on a des options pré-sélectionnées (reorder flow), elles priment.
  const defaultSelection: Record<string, number> = {};
  for (const [group, opts] of Object.entries(optionGroups)) {
    const prefilled = opts.find((o) => prefilledOptionIds.has(o.id));
    if (prefilled) {
      defaultSelection[group] = prefilled.id;
    } else if (group === 'qty') {
      // Depuis la fusion qty↔config, le slider démarre sur ce défaut. finding [18] —
      // palier choisi par VALEUR (le plus proche de ~500), pas par position : les
      // listes de paliers diffèrent selon le produit/la finition, donc une position
      // fixe (« 3e plus petit ») donnait des ancrages 6× différents (75u vs 750u)
      // entre deux finitions du MÊME produit. Le reorder override déjà via prefilled
      // ci-dessus.
      const popular = pickDefaultQuantityOption(opts);
      if (popular) defaultSelection[group] = popular.id;
    } else if (group === 'Stock' && isSidednessGroup(opts.map((o) => o.name))) {
      // finding [10] — quand `Stock` encode en réalité recto/recto-verso (pas
      // le papier), le défaut ne doit JAMAIS être le premier de la liste :
      // un client qui a conçu un recto-verso paierait une impression recto
      // sans le savoir. On biaise vers double face.
      const double = opts.find((o) => classifySidedness(o.name) === 'double');
      defaultSelection[group] = (double ?? opts[0]!).id;
    } else if (opts[0]) {
      defaultSelection[group] = opts[0].id;
    }
  }

  // Ce qui part au NAVIGATEUR : une TRANCHE, pas la matrice. Prix déjà markés
  // up via marginPct admin (cf. lib/products/pricing.ts).
  //
  // Envoyer l'index entier était sans conséquence tant qu'il était
  // accidentellement plafonné à 1000 entrées (~22 Ko). Pagination réparée, la
  // même ligne enverrait 403 Ko pour un flyer et 1,9 Mo pour le pire produit,
  // sur le chemin d'achat. La tranche est bornée par le nombre d'options, pas
  // par la taille de la matrice — cf. variant-slice.ts pour ce que le client
  // consomme réellement.
  const variantIndex = buildVariantSlice(optionGroups, defaultSelection, enrichedIndex.index);

  // ─── Compute price range pour AggregateOffer schema ─────────────────
  // On scanne l'index COMPLET (côté serveur — gratuit, il est déjà en mémoire),
  // PAS la tranche envoyée au client : le range annoncé à Google doit couvrir
  // tout le produit, pas le voisinage de la sélection par défaut. Prix déjà
  // markés up via marginPct admin.
  //
  // Effet de bord bienvenu du correctif de pagination : ce range était calculé
  // sur les 1000 premières variantes, c'est-à-dire les plus petites quantités —
  // le « high » annoncé était donc très en dessous du vrai prix maximum.
  let low = Infinity;
  let high = 0;
  for (const prix of enrichedIndex.index.values()) {
    if (prix <= 0) continue;
    if (prix < low) low = prix;
    if (prix > high) high = prix;
  }
  const priceCents = high > 0
    ? { low: Math.round(low * 100), high: Math.round(high * 100) }
    : null;

  return (
    <>
      <JsonLd data={breadcrumbSchema([
        { name: 'Accueil', path: '/' },
        { name: 'Commander', path: '/order/start' },
        { name: product.name ?? 'Produit', path: `/order/configure?productId=${productId}` },
      ])} />
      <JsonLd
        data={productSchema({
          id: productId,
          name: product.name?.trim() || `Produit Plio #${productId}`,
          description: detail.metadata?.join(' ') ?? null,
          sku: product.sku ?? null,
          category: product.category ?? null,
          priceCents,
          pageUrl: `/order/configure?productId=${productId}`,
        })}
      />
      <ConfigureClient
        product={product}
        optionGroups={optionGroups}
        metadata={detail.metadata}
        defaultSelection={defaultSelection}
        designId={designId}
        filesParam={filesParam}
        variantIndex={variantIndex}
      />
    </>
  );
}
