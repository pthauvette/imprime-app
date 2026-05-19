'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { useState, useMemo } from 'react';
import type { SinaliteOption, SinaliteProduct } from '@/lib/sinalite/types';
import { formatCurrency, formatNumber } from '@/lib/format';
import ClientHeaderUserSlot from '@/components/account/ClientHeaderUserSlot';

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
  /** Index pré-construit : `sortedIds.join('-')` → prix CAD. Permet de montrer
   *  le prix live à l'étape 3 (avant de connaître la quantité finale), au lieu
   *  d'attendre l'étape 4. On utilise la qty la plus basse comme préview. */
  variantIndex: Record<string, number>;
}

/**
 * Step 3 — Configure ta commande.
 *
 * State : Map<groupName, optionId> de la sélection courante.
 * Le groupe "qty" est exclu (géré au Step 4).
 */
export default function ConfigureClient({
  product,
  optionGroups,
  metadata,
  defaultSelection,
  designId,
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

  const pick = (group: string, id: number) => {
    setSelection((s) => ({ ...s, [group]: id }));
  };

  // Pour la preview de prix : on prend la plus PETITE qty du produit comme
  // référence. C'est le scénario "starter" — la qty sera ajustée à l'étape 4
  // (et le prix unitaire baisse à mesure que la qty monte). On affiche aussi
  // un teaser à la plus GRANDE qty pour montrer le pricing en gros.
  const sortedQty = useMemo(() => {
    const opts = optionGroups['qty'] ?? [];
    return [...opts].sort((a, b) => Number(a.name) - Number(b.name));
  }, [optionGroups]);

  const lookupPrice = (qtyOptId: number): number | null => {
    const ids = orderedGroups
      .map((g) => selection[g])
      .filter((v): v is number => typeof v === 'number');
    ids.push(qtyOptId);
    const key = [...ids].sort((a, b) => a - b).join('-');
    return variantIndex[key] ?? null;
  };

  const minQty = sortedQty[0];
  const maxQty = sortedQty[sortedQty.length - 1];
  const minQtyPrice = minQty ? lookupPrice(minQty.id) : null;
  const maxQtyPrice = maxQty && maxQty !== minQty ? lookupPrice(maxQty.id) : null;
  const minQtyUnit = minQtyPrice && minQty ? minQtyPrice / Number(minQty.name) : null;
  const maxQtyUnit = maxQtyPrice && maxQty ? maxQtyPrice / Number(maxQty.name) : null;

  const optionsParam = orderedGroups
    .map((g) => selection[g])
    .filter((v): v is number => typeof v === 'number')
    .join(',');

  const designSuffix = designId ? `&designId=${designId}` : '';
  const nextHref = `/order/quantity?productId=${product.id}&options=${optionsParam}${designSuffix}` as Route;
  const prevHref = `/order/product?category=${guessCategorySlug(product.category)}` as Route;

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link href={'/' as Route} className="wordmark" style={{ color: 'inherit' }}>Plio.</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb">
            <Link href={prevHref} style={{ color: 'var(--text-muted)' }}>{product.category}</Link>
            <span className="breadcrumb-sep">›</span> {product.name.trim()}
          </span>
        </div>
        <div className="progress-block">
          <div className="progress" role="progressbar" aria-valuenow={3} aria-valuemin={1} aria-valuemax={7}>
            <div className="progress-segment done"></div>
            <div className="progress-segment done"></div>
            <div className="progress-segment active"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
            <div className="progress-segment"></div>
          </div>
          <div className="progress-label">Étape 03 sur 07 — Configuration</div>
        </div>
        <div className="shell-header-right">
          <span className="badge badge-neutral">🇨🇦 Canada · CAD</span>
          <ClientHeaderUserSlot hideWhenAnonymous />
        </div>
      </header>

      <main className="step-layout">
        <div className="step-content" style={{ padding: '56px 80px', maxWidth: 1080 }}>
          <div className="step-eyebrow">Étape 03 — {product.name.trim()}</div>
          <h1 className="step-question">Configure ta <em>commande.</em></h1>
          <p className="step-lede">Le prix s'ajuste en temps réel à droite — change une option pour voir l'impact.</p>

          {orderedGroups.map((groupName, idx) => (
            <ConfigSection
              key={groupName}
              groupName={groupName}
              index={idx + 1}
              options={optionGroups[groupName]!}
              selectedId={selection[groupName]}
              onPick={(id) => pick(groupName, id)}
            />
          ))}

          {metadata.includes('custom_size') && <CustomSizeHint />}
        </div>

        <aside className="recap">
          <div>
            <div className="recap-section-label">Configuration courante</div>
            <div style={{ marginTop: 12 }}>
              {orderedGroups.map((g) => {
                const optId = selection[g];
                const opt = optionGroups[g]?.find((o) => o.id === optId);
                return (
                  <div key={g} className="recap-config-row">
                    <span className="label">{friendlyLabel(g)}</span>
                    <span className="value">{opt?.name ?? '—'}</span>
                  </div>
                );
              })}
              <div className="recap-config-row placeholder">
                <span className="label">Quantité</span>
                <span className="value">À choisir étape 4</span>
              </div>
            </div>

            {/* Live price preview — montre le prix de la plus petite qty (starter)
                et le prix unitaire à la plus grande qty (bulk). Permet au client
                de voir l'impact de chaque option AVANT d'arriver à l'étape qty. */}
            {minQty && minQtyPrice !== null ? (
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
                    Prix à partir de
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                    {formatNumber(Number(minQty.name))} u.
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, lineHeight: 1, color: 'var(--accent-primary)', fontWeight: 400, letterSpacing: '-0.02em' }}>
                  {formatCurrency(minQtyPrice)}
                </div>
                {minQtyUnit !== null && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    soit <strong>{formatCurrency(minQtyUnit)}</strong> / unité
                  </div>
                )}
                {maxQty && maxQtyPrice !== null && maxQtyUnit !== null && maxQtyUnit < (minQtyUnit ?? Infinity) && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    💡 À <strong>{formatNumber(Number(maxQty.name))}</strong> unités : <strong>{formatCurrency(maxQtyUnit)}</strong>/u
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                      {' '}(-{Math.round((((minQtyUnit ?? 0) - maxQtyUnit) / (minQtyUnit ?? 1)) * 100)}%)
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-sunken)', borderRadius: 'var(--r-md)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Le prix se calcule à l'étape suivante (combinaison non standard).
              </div>
            )}
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
        <div className="shell-footer-right">
          <button className="btn btn-primary" onClick={() => router.push(nextHref)}>
            {minQtyPrice !== null
              ? <>Ajuster la quantité · à partir de {formatCurrency(minQtyPrice)} <kbd>↵</kbd></>
              : <>Choisir la quantité <kbd>↵</kbd></>}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── ConfigSection — picker UI selon le type de groupe ───────────────────

function ConfigSection({
  groupName, index, options, selectedId, onPick,
}: {
  groupName: string;
  index: number;
  options: SinaliteOption[];
  selectedId?: number;
  onPick: (id: number) => void;
}) {
  const isSize = groupName === 'size';
  const isStock = groupName === 'Stock' || groupName.toLowerCase().includes('paper');
  const isCoating = groupName === 'Coating' || groupName.toLowerCase().includes('coat');
  const isBinary = options.length === 2 && options.every((o) => /^(yes|no|none|aucun)$/i.test(o.name.trim()));

  const sectionLabel = friendlyLabel(groupName);
  const currentName = options.find((o) => o.id === selectedId)?.name ?? '—';

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
        <SizeGrid options={options} selectedId={selectedId} onPick={onPick} />
      ) : isStock ? (
        <StockGrid options={options} selectedId={selectedId} onPick={onPick} />
      ) : isCoating ? (
        <Pills options={options} selectedId={selectedId} onPick={onPick} />
      ) : isBinary ? (
        <BinarySwitch options={options} selectedId={selectedId} onPick={onPick} />
      ) : (
        <Pills options={options} selectedId={selectedId} onPick={onPick} />
      )}
    </section>
  );
}

// ─── Picker variants ─────────────────────────────────────────────────────

interface PickerProps {
  options: SinaliteOption[];
  selectedId?: number;
  onPick: (id: number) => void;
}

function SizeGrid({ options, selectedId, onPick }: PickerProps) {
  return (
    <div className="format-grid">
      {options.map((opt) => {
        const dims = parseFormat(opt.name);
        const w = dims ? Math.min(130, Math.max(40, dims.w * 18)) : 100;
        const h = dims ? Math.min(130, Math.max(40, dims.h * 18)) : 100;
        return (
          <button
            key={opt.id}
            className={`format-card${selectedId === opt.id ? ' selected' : ''}`}
            onClick={() => onPick(opt.id)}
          >
            <div className="format-card-rect-wrap">
              <div className="format-card-rect" style={{ width: `${w}px`, height: `${h}px` }} />
            </div>
            <div className="format-card-name">{opt.name}{dims ? '"' : ''}</div>
            <div className="format-card-desc">{dims ? labelForFormat(dims) : 'Format'}</div>
          </button>
        );
      })}
    </div>
  );
}

function StockGrid({ options, selectedId, onPick }: PickerProps) {
  return (
    <div className="stock-grid">
      {options.map((opt) => {
        const cls = stockCssClass(opt.name);
        return (
          <button
            key={opt.id}
            className={`stock-card${selectedId === opt.id ? ' selected' : ''}`}
            onClick={() => onPick(opt.id)}
          >
            <div className={`stock-swatch ${cls}`} />
            <div className="stock-body">
              <div className="stock-name">{opt.name}</div>
              <div className="stock-desc">{stockDesc(opt.name)}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function Pills({ options, selectedId, onPick }: PickerProps) {
  return (
    <div className="finish-pills" role="tablist">
      {options.map((opt) => (
        <div
          key={opt.id}
          className={`finish-pill${selectedId === opt.id ? ' active' : ''}`}
          role="tab"
          aria-selected={selectedId === opt.id}
          onClick={() => onPick(opt.id)}
        >
          {opt.name}
        </div>
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
      <div
        className={`extra-row${isOn ? ' on' : ''}`}
        style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: 16, alignItems: 'center', padding: '16px 24px', cursor: 'pointer' }}
        onClick={() => onPick(isOn ? noOpt.id : yesOpt.id)}
      >
        <div className="extra-switch" />
        <div>
          <div className="extra-name">{yesOpt.name}</div>
          <div className="extra-desc">Activer / désactiver cette option.</div>
        </div>
        <span className="extra-delta">{isOn ? 'Activé' : 'Désactivé'}</span>
      </div>
    </div>
  );
}

function CustomSizeHint() {
  return (
    <div style={{ marginTop: 32, padding: 20, background: 'var(--accent-soft)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--text-primary)' }}>
      💡 <strong>Format personnalisé disponible</strong> — ce produit accepte des dimensions WxH custom (ex. 5x6). À configurer plus tard via le BFF.
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────

function romanize(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);
}

function friendlyLabel(group: string): string {
  const map: Record<string, string> = {
    size: 'Format',
    Stock: 'Papier',
    Coating: 'Finition',
    Turnaround: 'Délai',
    'Rounded Corners': 'Coins arrondis',
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

function guessCategorySlug(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('business card')) return 'cartes-de-visite';
  if (lower.includes('postcard')) return 'cartes-postales';
  if (lower.includes('flyer')) return 'flyers';
  if (lower.includes('brochure') || lower.includes('booklet')) return 'brochures';
  if (lower.includes('banner') || lower.includes('sign')) return 'bannieres';
  if (lower.includes('label') || lower.includes('sticker') || lower.includes('decal') || lower.includes('vinyl')) return 'etiquettes';
  if (lower.includes('letterhead') || lower.includes('envelope') || lower.includes('notepad') || lower.includes('ncr')) return 'stationnerie';
  return 'cartes-de-visite';
}
