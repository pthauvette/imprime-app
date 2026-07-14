import type { CategoryGroup } from '@/lib/catalogue';
import ProductMockup from './ProductMockup';
import { mockupForIcon } from '@/lib/products/product-mockup';

/**
 * Vignette de catégorie du wizard (/order/start) — mini-mockup produit rendu EN CODE
 * (SVG, cf. ProductMockup) à la place des anciennes icônes line-art génériques.
 */
export default function CategoryIcon({ icon }: { icon: CategoryGroup['icon'] }) {
  const m = mockupForIcon(icon);
  return (
    <span className="cat-mockup">
      <ProductMockup shape={m.shape} finish={m.finish} height={118} />
    </span>
  );
}
