/**
 * ProductMockup — vignette produit « beauté marketing » rendue EN CODE (SVG pur,
 * pas d'image, pas de WebGL). Chaque produit à sa VRAIE forme (carte, flyer portrait,
 * bannière haute, étiquette, dépliant) + sa finition réaliste (reflet gloss, dorure
 * foil, soft-touch, kraft, vert sapin) + profondeur (ombre teintée vert-noir) + charte.
 *
 * Sert les surfaces marketing : grille produits de l'accueil, icônes de catalogue.
 * (≠ FormatPreview qui montre les MARGES dans le wizard ; ici c'est une belle image.)
 * Server-renderable — aucun état, aucun hook.
 */
import { fitRect } from '@/lib/products/format-preview';
import { shapeAspect, type MockupShape, type MockupFinish } from '@/lib/products/product-mockup';

export type { MockupShape, MockupFinish };

const VB_W = 220;
const VB_H = 164;
const GREEN = '#1F3D2B';
const FOIL = 'url(#pmk-foil)';

/** Remplissage de base par finition. */
function baseFill(finish: MockupFinish): string {
  switch (finish) {
    case 'foil': return FOIL;
    case 'kraft': return 'url(#pmk-kraft)';
    case 'soft': return 'url(#pmk-soft)';
    case 'green': return GREEN;
    case 'gloss': return '#ffffff';
    case 'matte':
    case 'plain':
    default: return '#fbfaf7';
  }
}

export default function ProductMockup({
  shape,
  finish = 'plain',
  height = 150,
  title,
}: {
  shape: MockupShape;
  finish?: MockupFinish;
  height?: number;
  title?: string;
}) {
  const r = fitRect(shapeAspect(shape), 1, VB_W - 40, VB_H - 40); // fit ratio dans une boîte
  const x = 20 + r.x;
  const y = 16 + r.y;
  const w = r.w;
  const h = r.h;
  const rounded = shape === 'sticker' ? Math.min(16, w * 0.14) : shape === 'banner' ? 3 : 5;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rot = shape === 'banner' ? -2 : -3;
  const textColor = finish === 'green' || finish === 'foil' ? 'rgba(250,250,247,0.6)' : 'rgba(20,28,22,0.16)';
  const lineY = shape === 'flyer' ? y + 14 : cy - 8;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      height={height}
      role="img"
      aria-label={title ? `Aperçu produit : ${title}` : 'Aperçu produit'}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id="pmk-foil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d4af37" />
          <stop offset="0.5" stopColor="#f4e5b1" />
          <stop offset="1" stopColor="#caa233" />
        </linearGradient>
        <linearGradient id="pmk-kraft" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cdbb98" />
          <stop offset="1" stopColor="#bda67e" />
        </linearGradient>
        <linearGradient id="pmk-soft" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#f7f3ec" />
          <stop offset="1" stopColor="#ece5d8" />
        </linearGradient>
        {/* Reflet gloss : bande blanche diagonale */}
        <linearGradient id="pmk-gloss" x1="0" y1="0" x2="1" y2="0.5">
          <stop offset="0.28" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.46" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="0.56" stopColor="#e8e8e8" stopOpacity="0.25" />
          <stop offset="0.72" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="pmk-shadow" x="-30%" y="-20%" width="160%" height="150%">
          <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#141c16" floodOpacity="0.34" />
        </filter>
      </defs>

      <g transform={`rotate(${rot} ${cx} ${cy})`} filter="url(#pmk-shadow)">
        {/* Le produit */}
        <rect x={x} y={y} width={w} height={h} rx={rounded} fill={baseFill(finish)}
          stroke="rgba(20,28,22,0.16)" strokeWidth={1} />

        {/* Reflet gloss (par-dessus le blanc) */}
        {finish === 'gloss' && <rect x={x} y={y} width={w} height={h} rx={rounded} fill="url(#pmk-gloss)" />}

        {/* Bande de marque verte (flyer) */}
        {shape === 'flyer' && finish !== 'green' && (
          <rect x={x} y={y + h * 0.74} width={w} height={h * 0.26} rx={0} fill={GREEN} />
        )}

        {/* Pastille « P » (soft-touch / cartes premium) */}
        {(finish === 'soft' || finish === 'green') && (
          <>
            <circle cx={x + 15} cy={y + 15} r={9} fill={finish === 'green' ? '#fbfaf7' : GREEN} />
            <text x={x + 15} y={y + 19} textAnchor="middle" fontFamily="Georgia, serif" fontSize={11}
              fontWeight={700} fill={finish === 'green' ? GREEN : '#fbfaf7'}>P</text>
          </>
        )}

        {/* Lignes de texte suggérées */}
        <rect x={x + 12} y={lineY} width={w * 0.42} height={3} rx={1.5} fill={finish === 'foil' ? FOIL : textColor} />
        <rect x={x + 12} y={lineY + 9} width={w * 0.28} height={3} rx={1.5} fill={textColor} />

        {/* Œillets (bannière) */}
        {shape === 'banner' &&
          ([[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]] as const).map(([gx, gy], i) => (
            <circle key={i} cx={gx} cy={gy} r={3} fill="#fff" stroke={GREEN} strokeOpacity={0.5} strokeWidth={1} />
          ))}

        {/* Ligne de pli (dépliant) */}
        {shape === 'folded' && (
          <line x1={cx} y1={y + 3} x2={cx} y2={y + h - 3} stroke={GREEN} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="4 3" />
        )}
      </g>
    </svg>
  );
}
