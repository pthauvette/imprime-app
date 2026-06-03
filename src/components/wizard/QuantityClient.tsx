'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import type { SinaliteOption, SinaliteProduct } from '@/lib/sinalite/types';
import { formatCurrency, formatNumber } from '@/lib/format';
import { cleanBaseOptionIds, buildVariantKey } from '@/lib/products/variant-key';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';

interface Props {
  product: SinaliteProduct;
  /** Options sélectionnées à l'étape 3 (sans qty), e.g. [4, 30, 107, 224, 78]. */
  baseOptionIds: number[];
  /** Options du group "qty" disponibles pour ce produit. */
  qtyOptions: SinaliteOption[];
  /** Options du group "Turnaround" si présent, vide sinon. */
  turnaroundOptions: SinaliteOption[];
  /** Index pré-construit : `sortedIds.join('-')` → prix CAD. */
  variantIndex: Record<string, number>;
  /** ID de turnaround par défaut (déjà dans baseOptionIds si Step 3 l'avait pickée). */
  defaultTurnaroundId?: number;
  /** Si set, propagé vers /order/upload pour auto-load le PDF du design. */
  designId: string | null;
}

/**
 * Step 4 — Combien d'unités ?
 *
 * Le hero du wizard : un seul écran avec
 *  - Quantity slider (snap sur valeurs réelles Sinalite)
 *  - Display géant de la qty courante
 *  - 3 big numbers (unit / total / savings vs previous tier)
 *  - Turnaround pills (Standard / Rush)
 *
 * Le prix est résolu en O(1) via variantIndex côté client — zéro roundtrip.
 */
export default function QuantityClient({
  product,
  baseOptionIds,
  qtyOptions,
  turnaroundOptions,
  variantIndex,
  defaultTurnaroundId,
  designId,
}: Props) {
  const router = useRouter();

  // Sort qty options numerically (e.g. [25, 50, 100, 250, 500, 1000])
  const sortedQty = useMemo(
    () => [...qtyOptions].sort((a, b) => Number(a.name) - Number(b.name)),
    [qtyOptions],
  );

  // Default qty: middle of the range (most "popular" feel) or first
  const defaultQtyIdx = Math.min(2, sortedQty.length - 1);
  const [qtyIdx, setQtyIdx] = useState(defaultQtyIdx);
  const [turnaroundId, setTurnaroundId] = useState<number | undefined>(defaultTurnaroundId);

  // Audit v2 #4.1 — base nettoyée : on retire le turnaround (Step 3 a pu
  // l'inclure) ET les IDs du groupe qty. Sans le retrait du qty, un aller-retour
  // Upload→Précédent→Quantité réinjectait l'ancien qtyId (upload propage TOUTES
  // ses options, qty incluse) → lookupPrice construisait une clé à DEUX qtyId
  // (ancien + nouveau) absente de variantIndex → prix « — », bouton Continuer
  // désactivé → funnel bloqué sur un aller-retour banal.
  const qtyIdSet = useMemo(() => new Set(qtyOptions.map((o) => o.id)), [qtyOptions]);
  const baseWithoutTurnaround = useMemo(() => {
    const turnaroundIds = new Set(turnaroundOptions.map((o) => o.id));
    return cleanBaseOptionIds(baseOptionIds, qtyIdSet, turnaroundIds);
  }, [baseOptionIds, turnaroundOptions, qtyIdSet]);

  // Pour « Précédent » → Configurer : on garde le turnaround (Configurer a le
  // groupe délai) mais on retire le qty parasite (Configurer n'a pas de qty).
  const baseForConfigure = useMemo(
    () => baseOptionIds.filter((id) => !qtyIdSet.has(id)),
    [baseOptionIds, qtyIdSet],
  );

  const currentQty = sortedQty[qtyIdx];
  const qtyValue = currentQty ? Number(currentQty.name) : 0;

  const lookupPrice = (qtyOptId: number, turnId?: number): number | null => {
    return variantIndex[buildVariantKey(baseWithoutTurnaround, qtyOptId, turnId)] ?? null;
  };

  const currentPrice = currentQty ? lookupPrice(currentQty.id, turnaroundId) : null;
  const unitPrice = currentPrice && qtyValue > 0 ? currentPrice / qtyValue : null;

  // Savings vs previous qty tier (% change in $/unit)
  const prevQty = qtyIdx > 0 ? sortedQty[qtyIdx - 1] : null;
  const prevPrice = prevQty ? lookupPrice(prevQty.id, turnaroundId) : null;
  const prevUnit = prevPrice && prevQty ? prevPrice / Number(prevQty.name) : null;
  const savingsPct =
    unitPrice && prevUnit ? Math.round(((prevUnit - unitPrice) / prevUnit) * 100) : null;

  // "Meilleure valeur" = the qty with the lowest unit price
  const bestQtyIdx = useMemo(() => {
    let best = -1;
    let bestUnit = Infinity;
    for (let i = 0; i < sortedQty.length; i++) {
      const opt = sortedQty[i];
      if (!opt) continue;
      const p = lookupPrice(opt.id, turnaroundId);
      const v = Number(opt.name);
      if (p && v > 0 && p / v < bestUnit) {
        bestUnit = p / v;
        best = i;
      }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedQty, turnaroundId, variantIndex, baseWithoutTurnaround]);

  const isBestValue = qtyIdx === bestQtyIdx;

  // Continue → /order/upload
  const nextOptions = [...baseWithoutTurnaround, ...(currentQty ? [currentQty.id] : []), ...(turnaroundId ? [turnaroundId] : [])];
  const designSuffix = designId ? `&designId=${designId}` : '';
  const nextHref = `/order/upload?productId=${product.id}&options=${nextOptions.join(',')}${designSuffix}` as Route;
  // « Précédent » doit re-hydrater l'étape Configurer avec les options déjà
  // choisies (format/papier/finition/délai) — sinon retour sur la sélection par
  // défaut = perte du travail. configure lit ?options=ID1,ID2,… et re-coche via
  // prefilledOptionIds. On renvoie baseOptionIds (la sélection telle qu'elle
  // était en quittant Configurer ; la quantité, elle, se re-choisit ici).
  const prevHref = `/order/configure?productId=${product.id}&options=${baseForConfigure.join(',')}${designSuffix}` as Route;

  // Snap percentage for slider fill width
  const snapPct = sortedQty.length > 1 ? (qtyIdx / (sortedQty.length - 1)) * 100 : 50;

  return (
    <div className="qty-shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Plio.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">{product.name.trim()}</span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={4} aria-valuemin={1} aria-valuemax={7}>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 04 sur 07 — Quantité</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <ClientHeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="qty-content">
        <div className="qty-header">
          <div className="step-eyebrow">Étape 04</div>
          <h1 className="qty-question">
            Combien d'<em>unités ?</em>
          </h1>
          <p className="qty-lede">Plus tu commandes, moins c'est cher par unité.</p>
        </div>

        <div className="qty-display-block">
          <div className="qty-giant">
            <span id="qty-num">{formatNumber(qtyValue)}</span>
            <span className="qty-giant-unit">unités</span>
          </div>
          {isBestValue && <span className="qty-best-badge">⚡ Meilleure valeur</span>}
        </div>

        <div className="slider-wrap">
          <div className="slider-track">
            <div className="slider-fill" style={{ inset: `0 ${100 - snapPct}% 0 0` }} />
            <div className="slider-thumb" style={{ left: `${snapPct}%` }} aria-hidden="true" />
            {/* Native range input overlaid on the visual track — gives real drag,
                keyboard arrows, screen-reader support. Visually invisible but
                consumes the same hit area as the decorative track + thumb. */}
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

        <div className="big-numbers">
          <div className="big-number">
            <div className="big-number-label">Prix unitaire</div>
            <div className="big-number-value">
              {unitPrice !== null ? formatCurrency(unitPrice) : '—'}
            </div>
            <div className="big-number-sub">/ unité</div>
          </div>
          <div className="big-number">
            <div className="big-number-label">Sous-total</div>
            <div className="big-number-value">
              {currentPrice !== null ? formatCurrency(currentPrice) : '—'}
            </div>
            <div className="big-number-sub">{formatNumber(qtyValue)} unités</div>
          </div>
          <div className="big-number">
            <div className="big-number-label">Économie</div>
            <div className={`big-number-value${savingsPct && savingsPct > 0 ? ' savings' : ''}`}>
              {savingsPct !== null && savingsPct > 0 ? `-${savingsPct} %` : '—'}
            </div>
            <div className="big-number-sub">
              {prevQty ? `vs ${formatNumber(Number(prevQty.name))} unités` : 'premier palier'}
            </div>
          </div>
        </div>

        {/* Round 45 #2 — transparence prix : le sous-total ci-dessus n'inclut
            ni taxes ni livraison (elles dépendent de la province, saisie à
            l'étape 6). On le DIT ici pour préparer l'utilisateur au lieu de le
            surprendre au checkout — un calcul prématuré serait faux. */}
        <p
          style={{
            margin: '4px 0 0',
            fontSize: 12.5,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          + taxes et livraison, calculées une fois ton adresse saisie (étape 6).
          Aucun paiement avant la confirmation finale.
        </p>

        {prevQty && unitPrice && prevUnit && savingsPct && savingsPct > 0 && (
          <div className="qty-insight">
            <span className="qty-insight-icon">💡</span>
            <p className="qty-insight-text">
              À <strong>{formatNumber(qtyValue)}</strong> unités, tu paies <strong>{formatCurrency(unitPrice)}</strong>
              /unité. À <strong>{formatNumber(Number(prevQty.name))}</strong> unités, c'était{' '}
              <strong>{formatCurrency(prevUnit)}</strong>. <strong>-{savingsPct} %</strong> de coût par unité.
            </p>
          </div>
        )}

        {turnaroundOptions.length > 0 && (
          <div className="delay-block">
            <div className="delay-block-label">Quand tu en as besoin ?</div>
            <div className="delay-pills">
              {turnaroundOptions.map((opt) => {
                const priceAtThisDelay = currentQty ? lookupPrice(currentQty.id, opt.id) : null;
                const deltaVsDefault = priceAtThisDelay !== null && currentPrice !== null && defaultTurnaroundId
                  ? priceAtThisDelay - (defaultTurnaroundId === opt.id ? priceAtThisDelay : currentPrice)
                  : null;
                return (
                  <button
                    key={opt.id}
                    className={`delay-pill${turnaroundId === opt.id ? ' active' : ''}`}
                    onClick={() => setTurnaroundId(opt.id)}
                  >
                    <span className="delay-pill-emoji">{delayEmoji(opt.name)}</span>
                    <div>
                      <div className="delay-pill-name">{opt.name}</div>
                      <div className="delay-pill-time">{delayHint(opt.name)}</div>
                    </div>
                    <div className="delay-pill-price">
                      {turnaroundId === opt.id
                        ? 'Sélectionné'
                        : deltaVsDefault && deltaVsDefault > 0
                        ? `+${formatCurrency(deltaVsDefault)}`
                        : 'Inclus'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <div className="qty-strip">
        <div className="qty-strip-thumb">
          <div className="qty-strip-thumb-inner">
            <div className="qty-strip-thumb-dot"></div>
          </div>
        </div>
        <div className="qty-strip-mini">
          <div className="qty-strip-mini-label">Produit</div>
          <div className="qty-strip-mini-value">{product.name.trim().slice(0, 28)}</div>
        </div>
        <div className="qty-strip-mini">
          <div className="qty-strip-mini-label">Quantité</div>
          <div className="qty-strip-mini-value t-mono">{formatNumber(qtyValue)}</div>
        </div>
        <div className="qty-strip-mini">
          <div className="qty-strip-mini-label">Délai</div>
          <div className="qty-strip-mini-value">
            {turnaroundOptions.find((o) => o.id === turnaroundId)?.name ?? 'Standard'}
          </div>
        </div>
        <div></div>
        <div className="qty-strip-total">
          <div className="qty-strip-total-label">Sous-total</div>
          <div className="qty-strip-total-amount">
            {currentPrice !== null ? formatCurrency(currentPrice) : '—'}
          </div>
        </div>
      </div>

      <footer className="shell-footer">
        <div>
          <Link href={prevHref} className="btn btn-ghost">
            <span style={{ fontFamily: 'var(--font-mono)' }}>←</span> Précédent
          </Link>
        </div>
        <div className="shell-footer-center">↵ Entrée pour continuer · ←→ pour ajuster</div>
        <div className="shell-footer-right" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SaveConfigButton
            productId={product.id}
            productName={product.name.trim()}
            optionIds={nextOptions}
            summary={`${qtyValue ? formatNumber(qtyValue) + ' unités' : ''}${turnaroundId ? ' · ' + (turnaroundOptions.find((o) => o.id === turnaroundId)?.name ?? '') : ''}`.trim()}
            disabled={currentPrice === null}
          />
          <button
            className="btn btn-primary"
            onClick={() => router.push(nextHref)}
            disabled={currentPrice === null}
          >
            Téléverser le design <kbd>↵</kbd>
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── SaveConfigButton ────────────────────────────────────────────────────
// Bouton "★ Sauvegarder" inline qui appelle POST /api/saved-configs avec un
// nom suggéré par défaut (le summary). En cas de 401 (pas connecté), on
// redirige vers sign-in avec callback vers cette page (l'user revient ici,
// peut re-cliquer). Optimistic feedback : bouton devient "✓ Sauvé" 2s.

function SaveConfigButton({
  productId, productName, optionIds, summary, disabled,
}: {
  productId: number;
  productName: string;
  optionIds: number[];
  summary: string;
  disabled: boolean;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'duplicate'>('idle');
  const [error, setError] = useState<string | null>(null);
  // Round 41 #2 — Inline name form (était window.prompt customer-facing mobile).
  // Sur iPhone le prompt natif tronquait le default name (100 char) à ~25 chars
  // visibles + pas d'autofocus + no styled keyboard. Friction haute pour une
  // action discretionary → conversion vers saved-configs basse.
  const [naming, setNaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

  function openNameForm() {
    if (state !== 'idle' || disabled) return;
    setError(null);
    setNameInput(`${productName} · ${summary}`.slice(0, 100));
    setNaming(true);
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      setError('Nom requis');
      return;
    }
    setNaming(false);
    setState('saving');
    try {
      const res = await fetch('/api/saved-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, productId, productName, optionIds, summary }),
      });
      if (res.status === 401) {
        window.location.href = `/sign-in?callbackUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setState(data.duplicate ? 'duplicate' : 'saved');
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setState('idle');
    }
  }

  const label =
    state === 'saving' ? 'Sauvegarde…' :
    state === 'saved' ? '✓ Sauvegardé' :
    state === 'duplicate' ? '✓ Déjà sauvegardé' :
    '★ Sauvegarder';

  if (naming) {
    return (
      <form onSubmit={submitName} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Nom pour cette configuration"
          maxLength={100}
          autoFocus
          required
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-sm)',
            fontSize: 13,
            background: 'var(--bg-canvas)',
            color: 'var(--text-primary)',
            minWidth: 200,
          }}
        />
        <button type="submit" className="btn btn-primary btn-sm">
          ★ Sauver
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNaming(false)}>
          Annuler
        </button>
        {error && <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>}
      </form>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={openNameForm}
        disabled={disabled || state === 'saving'}
        title="Sauve cette configuration pour la retrouver d'un clic plus tard"
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        {label}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: 'var(--danger)' }} role="alert">{error}</span>
      )}
    </>
  );
}

function delayEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('next') || lower.includes('rush') || lower.includes('1 day')) return '🔥';
  if (lower.includes('express') || lower.includes('2 - 3') || lower.includes('2-3')) return '⚡';
  return '🌿';
}

function delayHint(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('next') || lower.includes('1 day')) return 'Production démarre demain';
  if (lower.includes('2 - 3') || lower.includes('2-3')) return 'Production express';
  if (lower.includes('4 - 5') || lower.includes('4-5')) return 'Production standard';
  return name;
}
