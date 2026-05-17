'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useMemo, useState } from 'react';
import type { SinaliteOption, SinaliteProduct } from '@/lib/sinalite/types';
import { formatCurrency, formatNumber } from '@/lib/format';

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

  // Remove old turnaround from baseOptionIds (Step 3 may have included it)
  const baseWithoutTurnaround = useMemo(() => {
    const turnaroundIds = new Set(turnaroundOptions.map((o) => o.id));
    return baseOptionIds.filter((id) => !turnaroundIds.has(id));
  }, [baseOptionIds, turnaroundOptions]);

  const currentQty = sortedQty[qtyIdx];
  const qtyValue = currentQty ? Number(currentQty.name) : 0;

  const lookupPrice = (qtyOptId: number, turnId?: number): number | null => {
    const ids = [...baseWithoutTurnaround, qtyOptId];
    if (turnId !== undefined) ids.push(turnId);
    const key = [...ids].sort((a, b) => a - b).join('-');
    return variantIndex[key] ?? null;
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
  const prevHref = `/order/configure?productId=${product.id}${designSuffix}` as Route;

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
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sauvegardé · 1s</span>
          <button className="btn btn-ghost btn-sm">⌘ K</button>
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
        <div className="shell-footer-right">
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
