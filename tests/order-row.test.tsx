/**
 * finding [60] — OrderRow ajoute un bouton "Recommander" sur la ligne
 * (pas seulement la page détail). Toute la ligne étant déjà navigable
 * (pattern "lien étiré" : Link absolute/inset:0 en fond), un <a> imbriqué
 * dans un autre <a> serait du HTML invalide. Ce test verrouille qu'il n'y
 * a JAMAIS de <a> imbriqué, et que les deux liens (ligne + Recommander)
 * pointent vers les bonnes URLs.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import OrderRow, { type OrderRowProps } from '@/components/account/OrderRow';

const baseOrder: OrderRowProps = {
  id: 'ord_test123',
  displayId: 'PLIO-001',
  status: 'DELIVERED',
  createdAt: new Date('2026-01-15').toISOString(),
  amountCents: 4599,
  shippingMethod: 'UPS Standard',
  taxCents: 500,
  shipName: 'Test User',
  shipCity: 'Montréal',
  shipProvince: 'QC',
};

describe('OrderRow', () => {
  it('ne produit jamais de <a> imbriqué (HTML invalide) — le 1er <a> (lien étiré de la ligne) est un élément VIDE, donc le 2e <a> qui suit est forcément un frère, pas un descendant', () => {
    const html = renderToStaticMarkup(<OrderRow order={baseOrder} />);
    expect(html).toMatch(/<a\b[^>]*><\/a>/);
  });

  it('la ligne pointe vers /orders/[id]', () => {
    const html = renderToStaticMarkup(<OrderRow order={baseOrder} />);
    expect(html).toContain(`href="/orders/${baseOrder.id}"`);
  });

  it('le bouton Recommander pointe vers /order/start?reorder=[id]', () => {
    const html = renderToStaticMarkup(<OrderRow order={baseOrder} />);
    expect(html).toContain(`href="/order/start?reorder=${baseOrder.id}"`);
  });

  it('exactement 2 liens par ligne (navigation + recommander)', () => {
    const html = renderToStaticMarkup(<OrderRow order={baseOrder} />);
    expect((html.match(/<a\b/g) ?? []).length).toBe(2);
  });
});
