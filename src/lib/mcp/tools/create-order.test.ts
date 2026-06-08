import { describe, it, expect } from 'vitest';
import { buildUploadUrl, formatOrderHandoffText, type OrderHandoff } from './create-order';

describe('MCP create_order (Mode A) — helpers purs', () => {
  it('buildUploadUrl : productId + optionIds, sans port/sig figé', () => {
    const url = buildUploadUrl(7, [5, 30, 203]);
    expect(url).toContain('/order/upload?productId=7&options=5,30,203');
    expect(url).not.toContain('ship='); // pas de port figé (le wizard ré-estime)
    expect(url).not.toContain('sig=');
  });

  it('formatOrderHandoffText : item ok → nom, prix, lien + sous-total', () => {
    const h: OrderHandoff = {
      items: [{ ok: true, slug: 'cartes-de-visite', name: 'Carte de visite', paper: '14pt', finish: 'aq', quantity: 500, productId: 2, optionIds: [5, 30, 203], subtotalCents: 2190, uploadUrl: 'https://www.plio.ca/order/upload?productId=2&options=5,30,203' }],
      subtotalCents: 2190,
      anyError: false,
    };
    const text = formatOrderHandoffText(h);
    expect(text).toContain('Carte de visite');
    expect(text).toContain('21.90 $ CAD');
    expect(text).toContain('/order/upload?productId=2');
    expect(text).toContain('livraison + taxes'); // honnêteté : pas le total final
    expect(text).not.toContain('undefined');
  });

  it('formatOrderHandoffText : item en erreur → message + quantités dispo', () => {
    const h: OrderHandoff = {
      items: [{ ok: false, slug: 'flyers', reason: 'quantity_unavailable', message: 'Quantité 333 indisponible.', availableQuantities: [250, 500] }],
      subtotalCents: 0,
      anyError: true,
    };
    const text = formatOrderHandoffText(h);
    expect(text).toContain('⚠️');
    expect(text).toContain('250, 500');
    expect(text).toContain('Aucun item valide');
  });

  it('formatOrderHandoffText : mixte (1 ok + 1 erreur) → garde le valide', () => {
    const h: OrderHandoff = {
      items: [
        { ok: true, slug: 'cartes-de-visite', name: 'Carte de visite', paper: '14pt', finish: 'aq', quantity: 500, productId: 2, optionIds: [5], subtotalCents: 2190, uploadUrl: 'https://x/order/upload?productId=2&options=5' },
        { ok: false, slug: 'flyers', reason: 'invalid_combo', message: 'Combinaison invalide.' },
      ],
      subtotalCents: 2190,
      anyError: true,
    };
    const text = formatOrderHandoffText(h);
    expect(text).toContain('Carte de visite');
    expect(text).toContain('⚠️ flyers');
    expect(text).not.toContain('Aucun item valide'); // il y a 1 valide
  });
});
