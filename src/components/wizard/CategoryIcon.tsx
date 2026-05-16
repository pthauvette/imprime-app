import type { CategoryGroup } from '@/lib/catalogue';

/**
 * SVG line-art icônes pour les 8 familles du wizard.
 * Toutes en 24×24 viewBox, stroke 1.5, fill none.
 * Le parent applique `.cat-icon` qui contrôle la couleur via currentColor.
 */
export default function CategoryIcon({ icon }: { icon: CategoryGroup['icon'] }) {
  const common = {
    className: 'cat-icon',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (icon) {
    case 'card':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case 'plane':
      return (
        <svg {...common}>
          <path d="M21 5L2 12.5l7 1.5L18 8l-6 9 1.5 4z" />
        </svg>
      );
    case 'postcard':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case 'book':
      return (
        <svg {...common}>
          <path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2zM22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
        </svg>
      );
    case 'banner':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="1" />
          <line x1="2" y1="20" x2="22" y2="20" />
          <line x1="6" y1="17" x2="6" y2="20" />
          <line x1="18" y1="17" x2="18" y2="20" />
        </svg>
      );
    case 'pen':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      );
    case 'label':
      return (
        <svg {...common}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7" cy="7" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'tshirt':
      return (
        <svg {...common}>
          <path d="M20.38 3.46L16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
        </svg>
      );
    case 'mug':
      return (
        <svg {...common}>
          <path d="M14 8h-1V3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V11a3 3 0 0 0-3-3z" />
          <line x1="6" y1="9" x2="14" y2="9" />
        </svg>
      );
  }
}
