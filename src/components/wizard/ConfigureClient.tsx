'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useMemo, useEffect, useRef } from 'react';
import type { SinaliteOption, SinaliteProduct } from '@/lib/sinalite/types';
import { categoryLabelFor } from '@/lib/products/marketing-names';
import { formatCurrency, formatNumber } from '@/lib/format';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';
import SaveConfigButton from '@/components/wizard/SaveConfigButton';
import FormatPreview from '@/components/wizard/FormatPreview';
import { previewKindForSinaliteCategory } from '@/lib/products/format-preview';
import { getMarginSpecBySinaliteCategory } from '@/lib/products/margin-specs';
import { findCategoryGroupBySinaliteCategory } from '@/lib/catalogue';
import { isSidednessGroup, classifySidedness, sidednessDesc, SIDEDNESS_LABEL } from '@/lib/products/sidedness';
import { parseSizeLabel } from '@/lib/products/parse-size';
import { pickDefaultQuantityOption } from '@/lib/products/default-quantity';
import { computeOptionPriceDelta } from '@/lib/products/option-price-delta';
import { Icon } from '@/components/ui/Icon';

type OptionGroupMap = Record<string, SinaliteOption[]>;

interface Props {
  product: SinaliteProduct;
  optionGroups: OptionGroupMap;
  metadata: string[];
  /** Default combo computed server-side (lowest qty + first of each). */
  defaultSelection: Record<string, number>;
  /** Si set, l'utilisateur arrive depuis /design/[slug] et son PDF est déjà
   *  généré — on propage l'ID jusqu'à /order/upload qui auto-load le fichier. */
  designId: string | null;
  /** `?files=` déjà porté par l'URL entrante (round-trip upload↔configure) —
   *  vide si le client n'a pas encore téléversé. Reporté sur `nextHref` pour
   *  ne pas forcer un re-téléversement au retour vers /order/upload. */
  filesParam: string;
  /** Index pré-construit : `sortedIds.join('-')` → prix CAD (matrice COMPLÈTE,
   *  toutes options + qty + turnaround). Pilote le prix LIVE : à mesure que
   *  l'utilisateur change une option OU déplace le slider de quantité, on relit
   *  la clé correspondante. La quantité est gérée ici (fusion de l'ancienne
   *  étape /quantity), plus à une étape séparée. */
  variantIndex: Record<string, number>;
}

/**
 * Étape 3 — Configure ta commande (options + QUANTITÉ + prix live).
 *
 * State : `selection` = Map<groupName, optionId> pour les options (format,
 * papier, finition, délai…) + `qtyIdx` = index dans les paliers de quantité.
 * Le groupe "qty" est rendu comme un slider ici (fusion de l'ancienne étape
 * /quantity) ; le prix se recalcule à chaque changement via le variantIndex.
 * « Continuer » va directement à /order/upload.
 */
export default function ConfigureClient({
  product,
  optionGroups,
  metadata,
  defaultSelection,
  designId,
  filesParam,
  variantIndex,
}: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<Record<string, number>>(defaultSelection);

  // Group order: size > Stock > Coating > everything else, qty excluded
  const orderedGroups = useMemo(() => {
    const priority: Record<string, number> = {
      size: 1, Stock: 2, Coating: 3, Finishing: 4, Turnaround: 99,
    };
    return Object.keys(optionGroups)
      .filter((g) => g !== 'qty')
      .sort((a, b) => (priority[a] ?? 50) - (priority[b] ?? 50));
  }, [optionGroups]);

  // finding [16] — 151/164 produits ont des groupes à UNE SEULE option (« Papier »
  // avec 1 seul grammage, etc.) : une section entière avec une seule carte déjà
  // cochée n'offre aucun choix, juste du bruit visuel (l'option reste sélectionnée
  // via defaultSelection côté serveur, RIEN ne change côté logique/prix — seul le
  // RENDU est filtré). `orderedGroups` reste la source de vérité pour la sélection,
  // le pricing et le payload envoyé à /upload.
  const visibleGroups = useMemo(
    () => orderedGroups.filter((g) => (optionGroups[g]?.length ?? 0) > 1),
    [orderedGroups, optionGroups],
  );

  const pick = (group: string, id: number) => {
    setSelection((s) => ({ ...s, [group]: id }));
  };

  // UX — quantité FUSIONNÉE dans la configuration (plus d'étape /quantity séparée).
  // Le slider qty + le prix réagissent en temps réel ; « Continuer » va direct à
  // l'upload. Le variantIndex est la matrice COMPLÈTE (toutes options + qty), donc
  // lookupPrice (qui inclut déjà la sélection courante, turnaround compris) donne
  // le prix exact pour la qty choisie.
  const sortedQty = useMemo(() => {
    const opts = optionGroups['qty'] ?? [];
    return [...opts].sort((a, b) => Number(a.name) - Number(b.name));
  }, [optionGroups]);

  // Default qty : le palier pré-rempli (flow reorder OU défaut serveur — cf.
  // configure/page.tsx pickDefaultQuantityOption) ; ce fallback ne devrait
  // normalement jamais s'exécuter (le serveur pose toujours un id valide), mais
  // finding [18] — s'il le fallait, on choisit aussi par VALEUR (~500), jamais
  // par position fixe.
  const [qtyIdx, setQtyIdx] = useState<number>(() => {
    const prefilledQtyId = defaultSelection['qty'];
    const i = prefilledQtyId ? sortedQty.findIndex((o) => o.id === prefilledQtyId) : -1;
    if (i >= 0) return i;
    const popular = pickDefaultQuantityOption(sortedQty);
    return popular ? sortedQty.findIndex((o) => o.id === popular.id) : 0;
  });

  const lookupPrice = (qtyOptId: number): number | null => {
    const ids = orderedGroups
      .map((g) => selection[g])
      .filter((v): v is number => typeof v === 'number');
    ids.push(qtyOptId);
    const key = [...ids].sort((a, b) => a - b).join('-');
    return variantIndex[key] ?? null;
  };

  // Toutes les options choisies (hors qty) + la qty sélectionnée → /upload.
  const selectedOptionIds = orderedGroups
    .map((g) => selection[g])
    .filter((v): v is number => typeof v === 'number');

  const currentQty = sortedQty[qtyIdx];
  const qtyValue = currentQty ? Number(currentQty.name) : 0;
  const localPrice = currentQty ? lookupPrice(currentQty.id) : null;

  // finding [15] — delta de prix par option, O(1) via l'index déjà en
  // navigateur (zéro appel réseau). Uniquement quand le prix COURANT vient de
  // l'index local (pas du repli distant) — sinon on risquerait de mélanger
  // deux bases de calcul différentes. Combinaison résultante absente de
  // l'index → null (le caller n'affiche alors AUCUN chiffre pour cette
  // option, jamais un chiffre deviné).
  const getOptionDelta = (groupName: string, optionId: number): number | null => {
    if (localPrice === null || !currentQty) return null;
    return computeOptionPriceDelta(
      { orderedGroups, selection, qtyOptionId: currentQty.id, variantIndex },
      groupName,
      optionId,
      localPrice,
    );
  };

  // ─── Repli prix distant ────────────────────────────────────────────────
  // L'index local ne couvre PAS toutes les combinaisons : produits `custom_size`
  // / `shapes`, ou matrice de variantes partielle chez Sinalite. Sans repli, le
  // configurateur affichait « Prix indisponible » ET désactivait « Continuer » —
  // donc un produit que le CHECKOUT sait tarifer (price-order.ts fait déjà ce
  // repli) devenait incommandable. On rétablit la symétrie.
  const [remotePrice, setRemotePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState(false);

  // Clé stable de la combinaison courante — c'est ELLE qui pilote l'effet, pas
  // les objets de sélection (qui changent d'identité à chaque rendu).
  const comboKey = currentQty
    ? [...selectedOptionIds, currentQty.id].sort((a, b) => a - b).join('-')
    : '';

  useEffect(() => {
    // Index local suffisant, ou combinaison incomplète → rien à demander.
    if (localPrice !== null || !comboKey) {
      setRemotePrice(null);
      setPriceError(false);
      setPriceLoading(false);
      return;
    }
    // Reset IMMÉDIAT (avant le debounce) — sinon le prix affiché reste celui
    // de la COMBINAISON PRÉCÉDENTE pendant tout le calcul du repli distant
    // (qty ou option changée, remotePrice ne se remet pas à zéro tant que le
    // nouveau fetch n'a pas résolu). Cf. docs/experience-client-2026-07.md
    // finding [11] — le client pouvait croire payer un prix qui n'était déjà
    // plus le bon.
    setRemotePrice(null);
    setPriceError(false);
    const ids = comboKey.split('-').map(Number);
    // AbortController : l'utilisateur peut enchaîner les options plus vite que
    // le réseau ; sans annulation, une réponse périmée écraserait la fraîche.
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setPriceLoading(true);
      setPriceError(false);
      fetch(`/api/products/${product.id}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: ids }),
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { price?: number }) => {
          if (typeof d.price === 'number' && d.price > 0) setRemotePrice(d.price);
          else setPriceError(true);
        })
        .catch((err) => { if ((err as Error).name !== 'AbortError') setPriceError(true); })
        .finally(() => setPriceLoading(false));
    }, 250); // debounce : ne pas tirer sur Sinalite à chaque clic d'option

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [comboKey, localPrice, product.id]);

  const currentPrice = localPrice ?? remotePrice;
  const unitPrice = currentPrice && qtyValue > 0 ? currentPrice / qtyValue : null;

  // Économie vs le palier de qty précédent (en $/unité).
  const prevQty = qtyIdx > 0 ? sortedQty[qtyIdx - 1] : null;
  const prevPrice = prevQty ? lookupPrice(prevQty.id) : null;
  const prevUnit = prevPrice && prevQty ? prevPrice / Number(prevQty.name) : null;
  const savingsPct = unitPrice && prevUnit ? Math.round(((prevUnit - unitPrice) / prevUnit) * 100) : null;

  // Teaser gros volume (plus grand palier, s'il est moins cher/unité que l'actuel).
  const maxQty = sortedQty[sortedQty.length - 1];
  const maxQtyPrice = maxQty && maxQty !== currentQty ? lookupPrice(maxQty.id) : null;
  const maxQtyUnit = maxQtyPrice && maxQty ? maxQtyPrice / Number(maxQty.name) : null;

  // Remplissage du slider (%).
  const snapPct = sortedQty.length > 1 ? (qtyIdx / (sortedQty.length - 1)) * 100 : 50;

  const allOptionIds = currentQty ? [...selectedOptionIds, currentQty.id] : selectedOptionIds;

  const designSuffix = designId ? `&designId=${designId}` : '';
  const filesSuffix = filesParam ? `&files=${filesParam}` : '';
  const nextHref = `/order/upload?productId=${product.id}&options=${allOptionIds.join(',')}${designSuffix}${filesSuffix}` as Route;
  const prevCategoryGroup = findCategoryGroupBySinaliteCategory(product.category);
  const prevHref = (
    prevCategoryGroup ? `/order/product?category=${prevCategoryGroup.slug}` : '/order/start'
  ) as Route;

  // Aperçu 2D du format : nature du substrat (souple/rigide/étiquette/plié) + taille
  // RÉELLE sélectionnée (fallback typicalTrim) + marges de la famille. Réactif au choix
  // de taille. C'est l'équivalent, pour les produits génériques, de l'aperçu 3D des 8 curatés.
  const marginSpec = getMarginSpecBySinaliteCategory(product.category);
  const previewKind = previewKindForSinaliteCategory(product.category);
  const sizeKey = orderedGroups.find((g) => g.toLowerCase() === 'size');
  const sizeOpt = sizeKey ? optionGroups[sizeKey]?.find((o) => o.id === selection[sizeKey]) : undefined;
  const previewDims = parseSizeLabel(sizeOpt?.name) ?? marginSpec.typicalTrim;
  const previewSizeLabel = `${previewDims.widthIn} × ${previewDims.heightIn} po`;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Plio.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">
            {/* Catégorie traduite : c'est le dernier endroit du parcours où la
                taxonomie ANGLAISE de Sinalite restait visible (« Business
                Cards › Carte de visite — 14pt… », moitié anglais moitié
                français dans le même fil d'Ariane). */}
            <Link href={prevHref} style={{ color: 'var(--text-muted)' }}>{categoryLabelFor(product.category)}</Link>
            <span className="breadcrumb-sep">›</span> {product.name.trim()}
          </span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={3} aria-valuemin={1} aria-valuemax={6}>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 03 sur 06 — Configuration & quantité</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <ClientHeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="step-layout">
        {/* Round 40 #2 — padding via .step-content CSS so mobile @media wins */}
        <div className="step-content" style={{ maxWidth: 1080 }}>
          <div className="step-eyebrow">Étape 03 — {product.name.trim()}</div>
          <h1 className="step-question">Configure ta <em>commande.</em></h1>
          <p className="step-lede">Le prix s'ajuste en temps réel à droite — change une option pour voir l'impact.</p>

          {/* Aperçu 2D du format (substrat + vraie dimension + marges) — pour les
              produits sans aperçu 3D (grand format, étiquettes, dépliants…). */}
          <div style={{ margin: '20px 0 8px', maxWidth: 520 }}>
            <FormatPreview
              widthIn={previewDims.widthIn}
              heightIn={previewDims.heightIn}
              kind={previewKind}
              bleedInches={marginSpec.bleedInches}
              safeInches={marginSpec.safeInches}
              sizeLabel={previewSizeLabel}
              height={240}
            />
          </div>

          {visibleGroups.map((groupName, idx) => (
            <ConfigSection
              key={groupName}
              groupName={groupName}
              index={idx + 1}
              options={optionGroups[groupName]!}
              selectedId={selection[groupName]}
              onPick={(id) => pick(groupName, id)}
              getDelta={(optionId) => getOptionDelta(groupName, optionId)}
            />
          ))}

          {/* Quantité — fusionnée ici (avant : étape /quantity séparée). Slider sur
              les paliers réels Sinalite ; le prix à droite suit en temps réel. */}
          {sortedQty.length > 0 && (
            <section style={{ padding: '40px 0', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 16, alignItems: 'baseline', marginBottom: 24 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>
                  {romanize(visibleGroups.length + 1)}.
                </span>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.01em', margin: '0 0 4px', fontWeight: 400 }}>
                    Quantité
                  </h2>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Plus tu commandes, moins c&apos;est cher par unité.
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 'var(--r-pill)', background: 'var(--bg-sunken)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  {formatNumber(qtyValue)} u.
                </span>
              </div>

              <div className="slider-wrap">
                <div className="slider-track">
                  <div className="slider-fill" style={{ inset: `0 ${100 - snapPct}% 0 0` }} />
                  <div className="slider-thumb" style={{ left: `${snapPct}%` }} aria-hidden="true" />
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, sortedQty.length - 1)}
                    step={1}
                    value={qtyIdx}
                    onChange={(e) => setQtyIdx(Number(e.target.value))}
                    aria-label="Quantité"
                    aria-valuetext={`${formatNumber(qtyValue)} unités`}
                    className="slider-input"
                  />
                </div>
                <div className="slider-ticks">
                  {sortedQty.map((opt, i) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`slider-tick${i === qtyIdx ? ' active' : ''}`}
                      onClick={() => setQtyIdx(i)}
                      aria-label={`${formatNumber(Number(opt.name))} unités`}
                      aria-pressed={i === qtyIdx}
                    >
                      <div className="slider-tick-mark"></div>
                      <div className="slider-tick-label">{formatNumber(Number(opt.name))}</div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {metadata.includes('custom_size') && <CustomSizeHint />}
        </div>

        {/* Audit mobile 5.1 — `recap-config` : ce recap porte le PRIX LIVE ; le
            `.recap` global est masqué <1100px, ce qui rendait la feature « prix
            en temps réel » invisible sur mobile (le lede la promet pourtant).
            Override CSS ciblé (.recap.recap-config) le ré-affiche, empilé. */}
        <aside className="recap recap-config">
          <div>
            <div className="recap-section-label">Configuration courante</div>
            <div style={{ marginTop: 12 }}>
              {orderedGroups.map((g) => {
                const optId = selection[g];
                const groupOptions = optionGroups[g] ?? [];
                const opt = groupOptions.find((o) => o.id === optId);
                return (
                  <div key={g} className="recap-config-row">
                    <span className="label">{friendlyLabel(g)}</span>
                    <span className="value">{friendlyOptionValue(groupOptions, opt)}</span>
                  </div>
                );
              })}
              <div className="recap-config-row">
                <span className="label">Quantité</span>
                <span className="value">{currentQty ? `${formatNumber(qtyValue)} u.` : '—'}</span>
              </div>
            </div>

            {/* Prix LIVE — total + prix/unité pour la qty SÉLECTIONNÉE (le slider
                ci-contre le pilote), + l'économie vs le palier précédent et un
                teaser gros volume. Plus de « prix à l'étape suivante ».
                finding [81] — aria-live sur un wrapper STABLE (le ternaire swap
                de div sinon certains lecteurs d'écran ratent l'annonce) : le
                lede promet « le prix s'ajuste en temps réel », mais rien n'était
                audible sans regarder l'écran. */}
            <div aria-live="polite" aria-atomic="true">
            {currentQty && currentPrice !== null ? (
              <div
                style={{
                  marginTop: 20,
                  padding: 18,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: 'var(--r-md)',
                  display: 'grid',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Sous-total
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {formatNumber(qtyValue)} u.
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color: 'var(--accent-primary)', fontWeight: 400, letterSpacing: '-0.02em' }}>
                  {formatCurrency(currentPrice)}
                </div>
                {unitPrice !== null && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    soit <strong>{formatCurrency(unitPrice)}</strong> / unité
                    {savingsPct !== null && savingsPct > 0 && (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                        {' '}· -{savingsPct}% vs {prevQty ? formatNumber(Number(prevQty.name)) : ''} u.
                      </span>
                    )}
                  </div>
                )}
                {maxQty && maxQtyPrice !== null && maxQtyUnit !== null && unitPrice !== null && maxQtyUnit < unitPrice && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    <Icon name="info" size={14} /> À <strong>{formatNumber(Number(maxQty.name))}</strong> unités : <strong>{formatCurrency(maxQtyUnit)}</strong>/u
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                      {' '}(-{Math.round(((unitPrice - maxQtyUnit) / unitPrice) * 100)}%)
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  + taxes et livraison, calculées une fois ton adresse saisie.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {priceLoading
                  ? 'Calcul du prix en cours…'
                  : priceError
                    // Message HONNÊTE : le repli distant a échoué, « ajuster une
                    // option » n'y changera probablement rien (le trou est
                    // structurel). On oriente vers l'action utile.
                    ? <>Prix temporairement indisponible chez l&apos;imprimeur. Réessaie dans un instant — si ça persiste, écris-nous à <a href="mailto:bonjour@plio.ca" style={{ color: 'var(--accent-primary)' }}>bonjour@plio.ca</a>.</>
                    : 'Calcul du prix…'}
              </div>
            )}
            </div>
          </div>
        </aside>
      </main>

      <footer className="shell-footer">
        <div>
          <Link href={prevHref} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour continuer · Tab pour naviguer</div>
        <div className="shell-footer-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SaveConfigButton
            productId={product.id}
            productName={product.name.trim()}
            optionIds={allOptionIds}
            summary={qtyValue ? `${formatNumber(qtyValue)} unités` : ''}
            disabled={currentPrice === null}
          />
          <button className="btn btn-primary" onClick={() => router.push(nextHref)} disabled={currentPrice === null}>
            {currentPrice !== null
              ? <>Téléverser le design · {formatCurrency(currentPrice)} <kbd>↵</kbd></>
              : <>Téléverser le design <kbd>↵</kbd></>}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── ConfigSection — picker UI selon le type de groupe ───────────────────

function ConfigSection({
  groupName, index, options, selectedId, onPick, getDelta,
}: {
  groupName: string;
  index: number;
  options: SinaliteOption[];
  selectedId?: number;
  onPick: (id: number) => void;
  getDelta: (optionId: number) => number | null;
}) {
  const isSize = groupName === 'size';
  // finding [97]/[10] — pour certains produits, `Stock` encode recto/recto-
  // verso, pas le papier. Priorité à cette détection AVANT isStock : sinon
  // le groupe s'affiche comme un choix de papier (StockGrid), avec la même
  // description générique pour les deux options et un défaut arbitraire.
  const isSidedness = groupName === 'Stock' && isSidednessGroup(options.map((o) => o.name));
  const isStock = !isSidedness && (groupName === 'Stock' || groupName.toLowerCase().includes('paper'));
  const isCoating = groupName === 'Coating' || groupName.toLowerCase().includes('coat');
  const isBinary = options.length === 2 && options.every((o) => /^(yes|no|none|aucun)$/i.test(o.name.trim()));

  const sectionLabel = isSidedness ? SIDEDNESS_LABEL : friendlyLabel(groupName);
  const selectedOption = options.find((o) => o.id === selectedId);
  const currentName = isSidedness && selectedOption
    ? (classifySidedness(selectedOption.name) === 'double' ? 'Recto-verso' : 'Recto seulement')
    : selectedOption?.name ?? '—';

  return (
    <section style={{ padding: '40px 0', borderTop: index > 1 ? '1px solid var(--border-subtle)' : 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 16, alignItems: 'baseline', marginBottom: 24 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.06em', fontWeight: 600 }}>
          {romanize(index)}.
        </span>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, letterSpacing: '-0.01em', margin: '0 0 4px', fontWeight: 400 }}>
            {sectionLabel}
          </h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {options.length} option{options.length > 1 ? 's' : ''} disponible{options.length > 1 ? 's' : ''}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 'var(--r-pill)', background: 'var(--bg-sunken)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
          {currentName}
        </span>
      </div>

      {isSize ? (
        <SizeGrid options={options} selectedId={selectedId} onPick={onPick} getDelta={getDelta} />
      ) : isSidedness ? (
        <SidednessGrid options={options} selectedId={selectedId} onPick={onPick} getDelta={getDelta} />
      ) : isStock ? (
        <StockGrid options={options} selectedId={selectedId} onPick={onPick} getDelta={getDelta} />
      ) : isCoating ? (
        <Pills options={options} selectedId={selectedId} onPick={onPick} getDelta={getDelta} />
      ) : isBinary ? (
        <BinarySwitch options={options} selectedId={selectedId} onPick={onPick} />
      ) : (
        <Pills options={options} selectedId={selectedId} onPick={onPick} getDelta={getDelta} />
      )}
    </section>
  );
}

// ─── Picker variants ─────────────────────────────────────────────────────

interface PickerProps {
  options: SinaliteOption[];
  selectedId?: number;
  onPick: (id: number) => void;
  /** finding [15] — delta $ vs le prix courant ; null = combinaison inconnue
   *  de l'index local, ne rien afficher (jamais un chiffre deviné). */
  getDelta?: (optionId: number) => number | null;
}

/** « +2,50 $ » / « -1,00 $ » / « Inclus » (delta 0, l'option courante) — ou
 *  rien si le delta est inconnu (fail-safe, cf. computeOptionPriceDelta). */
function DeltaLabel({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const style = {
    display: 'block',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 600,
    marginTop: 2,
    color: delta === 0 ? 'var(--text-muted)' : delta > 0 ? 'var(--text-secondary)' : 'var(--success, #1F3D2B)',
  };
  if (delta === 0) return <span style={style}>Inclus</span>;
  return <span style={style}>{delta > 0 ? '+' : ''}{formatCurrency(delta)}</span>;
}

function SizeGrid({ options, selectedId, onPick, getDelta }: PickerProps) {
  return (
    <div className="format-grid">
      {options.map((opt) => {
        const dims = parseFormat(opt.name);
        const w = dims ? Math.min(130, Math.max(40, dims.w * 18)) : 100;
        const h = dims ? Math.min(130, Math.max(40, dims.h * 18)) : 100;
        return (
          <button
            key={opt.id}
            type="button"
            className={`format-card${selectedId === opt.id ? ' selected' : ''}`}
            aria-pressed={selectedId === opt.id}
            onClick={() => onPick(opt.id)}
          >
            <div className="format-card-rect-wrap">
              <div className="format-card-rect" style={{ width: `${w}px`, height: `${h}px` }} />
            </div>
            <div className="format-card-name">{opt.name}{dims ? '"' : ''}</div>
            <div className="format-card-desc">{dims ? labelForFormat(dims) : 'Format'}</div>
            <DeltaLabel delta={getDelta?.(opt.id) ?? null} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Recto / recto-verso — cas où le groupe Sinalite `Stock` encode en réalité
 * le nombre de faces, pas le papier (cf. lib/products/sidedness.ts). Deux
 * cartes avec un libellé + une description DISTINCTS (contrairement à
 * StockGrid, qui retombait sur la même description générique pour les deux
 * quand le nom d'option ne matchait aucun grammage connu).
 */
function SidednessGrid({ options, selectedId, onPick, getDelta }: PickerProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, 1fr)`, gap: 16 }}>
      {options.map((opt) => {
        const kind = classifySidedness(opt.name);
        const label = kind === 'double' ? 'Recto-verso' : 'Recto seulement';
        return (
          <button
            key={opt.id}
            type="button"
            className={`stock-card${selectedId === opt.id ? ' selected' : ''}`}
            aria-pressed={selectedId === opt.id}
            onClick={() => onPick(opt.id)}
          >
            <div className="stock-body">
              <div className="stock-name">{label}</div>
              <div className="stock-desc">{kind ? sidednessDesc(kind) : opt.name}</div>
              <DeltaLabel delta={getDelta?.(opt.id) ?? null} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StockGrid({ options, selectedId, onPick, getDelta }: PickerProps) {
  return (
    <div className="stock-grid">
      {options.map((opt) => {
        const cls = stockCssClass(opt.name);
        return (
          <button
            key={opt.id}
            type="button"
            className={`stock-card${selectedId === opt.id ? ' selected' : ''}`}
            aria-pressed={selectedId === opt.id}
            onClick={() => onPick(opt.id)}
          >
            <div className={`stock-swatch ${cls}`} />
            <div className="stock-body">
              <div className="stock-name">{opt.name}</div>
              <div className="stock-desc">{stockDesc(opt.name)}</div>
              <DeltaLabel delta={getDelta?.(opt.id) ?? null} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Pills({ options, selectedId, onPick, getDelta }: PickerProps) {
  // Round 30 #5 — Avant <div role="tab" onClick>. Le footer wizard
  // disait "Tab pour naviguer · ↵ Entrée pour continuer" mais ce composant
  // n'était pas focusable et Enter ne marchait pas. Maintenant <button>
  // type="button" → focus, Space, Enter free, conserve l'ARIA role="tab".
  return (
    <div className="finish-pills" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`finish-pill${selectedId === opt.id ? ' active' : ''}`}
          role="tab"
          aria-selected={selectedId === opt.id}
          onClick={() => onPick(opt.id)}
        >
          {opt.name} <DeltaLabel delta={getDelta?.(opt.id) ?? null} />
        </button>
      ))}
    </div>
  );
}

function BinarySwitch({ options, selectedId, onPick }: PickerProps) {
  const yesOpt = options.find((o) => !/^(no|none|aucun)$/i.test(o.name.trim())) ?? options[0]!;
  const noOpt = options.find((o) => o.id !== yesOpt.id) ?? options[1]!;
  const isOn = selectedId === yesOpt.id;
  return (
    <div className="extras-card" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-lg)', padding: '8px 0', boxShadow: 'var(--shadow-xs)' }}>
      {/* Round 30 #5 — Avant <div onClick> → pas keyboard. Maintenant
          <button type="button"> + role="switch" + aria-checked, focusable,
          Space/Enter pour toggle. */}
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        className={`extra-row${isOn ? ' on' : ''}`}
        style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 16, alignItems: 'center', padding: '16px 24px', cursor: 'pointer', width: '100%', border: 'none', background: 'transparent', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        onClick={() => onPick(isOn ? noOpt.id : yesOpt.id)}
      >
        <div className="extra-switch" />
        <div>
          <div className="extra-name">{yesOpt.name}</div>
          <div className="extra-desc">Activer / désactiver cette option.</div>
        </div>
        <span className="extra-delta">{isOn ? 'Activé' : 'Désactivé'}</span>
      </button>
    </div>
  );
}

function CustomSizeHint() {
  return (
    <div style={{ marginTop: 32, padding: 20, background: 'var(--accent-soft)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--text-primary)' }}>
      <Icon name="info" size={14} /> <strong>Format personnalisé disponible</strong> — ce produit accepte des dimensions WxH custom (ex. 5x6). À configurer plus tard via le BFF.
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function romanize(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}

/**
 * finding UI/UX 2026-08 — le recap « Configuration courante » affichait la
 * valeur Sinalite BRUTE (ex. « NO », « YES ») pour les groupes binaires,
 * alors que le toggle plus haut dans la même page traduit déjà ces mêmes
 * options en « Activé »/« Désactivé ». Incohérent au sein d'une même page.
 * Scope volontairement étroit : un Oui/Non littéral se traduit sans risque
 * de mal représenter un vrai papier/finition (contrairement aux valeurs
 * composées type « 14PT Printed 2 Sides (4/4) », qui restent en anglais —
 * dictionnaire de traduction complet = projet contenu séparé, cf. roadmap).
 */
function friendlyOptionValue(
  groupOptions: SinaliteOption[],
  opt: SinaliteOption | undefined,
): string {
  if (!opt) return '—';
  const isBinary = groupOptions.length === 2 &&
    groupOptions.every((o) => /^(yes|no|none|aucun)$/i.test(o.name.trim()));
  if (isBinary) {
    return /^yes$/i.test(opt.name.trim()) ? 'Activé' : 'Désactivé';
  }
  return opt.name;
}

function friendlyLabel(group: string): string {
  const map: Record<string, string> = {
    size: 'Format',
    Stock: 'Papier',
    Coating: 'Finition',
    Turnaround: 'Délai',
    'Round Corners': 'Coins arrondis',
    Scoring: 'Pliage (scoring)',
    Bundling: 'Bundling',
    Folding: 'Pliage',
    Color: 'Couleur',
  };
  return map[group] ?? group;
}

function parseFormat(name: string): { w: number; h: number } | null {
  const m = name.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { w: parseFloat(m[1]!), h: parseFloat(m[2]!) };
}

function labelForFormat({ w, h }: { w: number; h: number }): string {
  if (Math.abs(w - h) < 0.1) return 'Carré';
  if (w > h) return 'Horizontal';
  return 'Vertical';
}

function stockCssClass(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('soft touch') || lower.includes('velvet')) return 'soft';
  if (lower.includes('matte') || lower.includes('silk')) return 'matte';
  if (lower.includes('kraft')) return 'kraft';
  return 'coated';
}

function stockDesc(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('14pt')) return '350 g/m² · standard, économique';
  if (lower.includes('16pt')) return '400 g/m² · plus épais, premium';
  if (lower.includes('18pt')) return '450 g/m² · sensation veloutée';
  if (lower.includes('kraft')) return '300 g/m² · 100 % recyclé';
  return 'Voir specs détaillées';
}

