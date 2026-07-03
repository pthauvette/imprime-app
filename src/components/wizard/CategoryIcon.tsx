import type { CategoryGroup } from '@/lib/catalogue';
import ProductMockup, { type MockupShape, type MockupFinish } from './ProductMockup';

/**
 * Vignette de catégorie du wizard (/order/start) — mini-mockup produit rendu EN CODE
 * (SVG, cf. ProductMockup) à la place des anciennes icônes line-art génériques.
 * Chaque famille → une forme + finition représentatives.
 */
const ICON_MOCKUP: Record<CategoryGroup['icon'], { shape: MockupShape; finish: MockupFinish }> = {
  card: { shape: 'card', finish: 'gloss' },
  plane: { shape: 'flyer', finish: 'matte' },
  postcard: { shape: 'postcard', finish: 'gloss' },
  book: { shape: 'folded', finish: 'soft' },
  banner: { shape: 'banner', finish: 'matte' },
  pen: { shape: 'card', finish: 'plain' },
  label: { shape: 'sticker', finish: 'plain' },
  tshirt: { shape: 'card', finish: 'kraft' },
  mug: { shape: 'postcard', finish: 'matte' },
};

export default function CategoryIcon({ icon }: { icon: CategoryGroup['icon'] }) {
  const m = ICON_MOCKUP[icon] ?? ICON_MOCKUP.card;
  return (
    <span className="cat-mockup">
      <ProductMockup shape={m.shape} finish={m.finish} height={70} />
    </span>
  );
}
