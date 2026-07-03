/**
 * Aperçu 2D « format » (SVG) pour les produits du flow générique sans aperçu 3D :
 * grand format souple (bannières/pull-up → œillets), rigide (coroplaste → cannelure),
 * étiquettes (contour die-cut), plié/relié (ligne de pli), plat (rectangle simple).
 *
 * Rend le produit au VRAI ratio (fitRect) + guides fond perdu (bleed) & zone sûre (safe).
 * Composant sans état/DOM → utilisable partout ; pas de WebGL (contrairement à FinishPreview3D).
 */
import { fitRect, substrateLabel, type FormatKind } from '@/lib/products/format-preview';

interface Props {
  widthIn: number;
  heightIn: number;
  kind: FormatKind;
  bleedInches?: number;
  safeInches?: number;
  /** Libellé de taille affiché (ex. « 24 × 36 po »). */
  sizeLabel?: string;
  /** Hauteur du conteneur en px. */
  height?: number;
}

const VB_W = 400;
const VB_H = 300;
const BOX = { x: 28, y: 22, w: 344, h: 206 };
const GREEN = '#1f3d2b';

const FILL: Record<FormatKind, string> = {
  souple: '#fbfaf7',
  rigide: '#efece4',
  label: '#ffffff',
  folded: '#faf7f1',
  flat: '#faf7f1',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function FormatPreview({
  widthIn,
  heightIn,
  kind,
  bleedInches = 0.125,
  safeInches = 0.125,
  sizeLabel,
  height = 240,
}: Props) {
  const r = fitRect(widthIn, heightIn, BOX.w, BOX.h);
  const x = BOX.x + r.x;
  const y = BOX.y + r.y;
  const w = r.w;
  const h = r.h;
  const s = Math.min(w, h);
  const minIn = Math.min(widthIn, heightIn) || 1;
  const safeInset = clamp((safeInches / minIn) * s, 5, s * 0.28);
  const bleedOut = clamp((bleedInches / minIn) * s, 0, 9);
  const rounded = kind === 'label' ? Math.min(14, s * 0.12) : 2;
  const label = `${sizeLabel ? sizeLabel + ' · ' : ''}${substrateLabel(kind)}`;
  const flutes = Math.max(3, Math.round(w / 16));

  return (
    <div style={{ width: '100%', height, background: 'var(--bg-sunken, #f2f2ee)', borderRadius: 12, overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" height="100%" role="img" aria-label={`Aperçu du format : ${label}`} preserveAspectRatio="xMidYMid meet">
        {/* Ombre portée douce (teintée vert-noir, jamais grise plate) */}
        <ellipse cx={x + w / 2} cy={y + h + 9} rx={w * 0.42} ry={6} fill="rgba(20,28,22,0.10)" />

        {/* Fond perdu (bleed) — cadre pointillé extérieur */}
        {bleedOut > 1 && (
          <rect x={x - bleedOut} y={y - bleedOut} width={w + bleedOut * 2} height={h + bleedOut * 2}
            fill="none" stroke={GREEN} strokeOpacity={0.22} strokeWidth={1} strokeDasharray="4 4" rx={rounded} />
        )}

        {/* Contour de découpe (étiquettes die-cut) */}
        {kind === 'label' && (
          <rect x={x - 5} y={y - 5} width={w + 10} height={h + 10} fill="none" stroke={GREEN} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3 3" rx={rounded + 4} />
        )}

        {/* Le produit */}
        <rect x={x} y={y} width={w} height={h} fill={FILL[kind]} stroke="rgba(20,28,22,0.18)" strokeWidth={1} rx={rounded} />

        {/* Cannelure coroplaste (rigide) */}
        {kind === 'rigide' &&
          Array.from({ length: flutes }).map((_, i) => {
            const fx = x + ((i + 1) / (flutes + 1)) * w;
            return <line key={i} x1={fx} y1={y + 3} x2={fx} y2={y + h - 3} stroke="#d7d1c3" strokeWidth={1} />;
          })}

        {/* Œillets (grand format souple / bannière) */}
        {kind === 'souple' &&
          ([[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]] as const).map(([gx, gy], i) => (
            <circle key={i} cx={gx} cy={gy} r={3.5} fill="#fff" stroke={GREEN} strokeOpacity={0.5} strokeWidth={1.2} />
          ))}

        {/* Ligne de pli (plié / relié) */}
        {kind === 'folded' && (
          <line x1={x + w / 2} y1={y + 3} x2={x + w / 2} y2={y + h - 3} stroke={GREEN} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="5 4" />
        )}

        {/* Zone sûre (safe) — cadre pointillé intérieur */}
        <rect x={x + safeInset} y={y + safeInset} width={w - safeInset * 2} height={h - safeInset * 2}
          fill="none" stroke={GREEN} strokeOpacity={0.45} strokeWidth={1} strokeDasharray="4 4" rx={Math.max(0, rounded - 2)} />

        {/* Légende */}
        <text x={VB_W / 2} y={VB_H - 14} textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize={13} fill="#626c64" letterSpacing="0.04em">
          {label}
        </text>
      </svg>
    </div>
  );
}
