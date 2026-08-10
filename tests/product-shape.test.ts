/**
 * Détection de la forme de données produit Sinalite.
 *
 * Les deux échantillons ci-dessous sont les CLÉS RÉELLEMENT RENVOYÉES par
 * l'API, relevées en direct le 2026-08-10 sur `/product/1/en_ca` et
 * `/product/7028/en_ca`. Pas des exemples de doc : la doc du portail décrit la
 * forme rouleau mais ne dit nulle part que les deux cohabitent sous le même
 * endpoint, ni comment les distinguer.
 */
import { describe, it, expect } from 'vitest';
import {
  detecterFormeProduit,
  FormeProduitNonSupportee,
} from '@/lib/sinalite/product-shape';

/** Relevé sur /product/1/en_ca — carte de visite. */
const STANDARD = [
  [
    { id: 4, group: 'size', name: '3.5 x 2', hidden: 0 },
    { id: 5, group: 'qty', name: '50', hidden: 0 },
  ],
  [{ hash: 'abc', value: '0.02' }],
  [{ metadata: 'custom_size' }],
];

/** Relevé sur /product/7028/en_ca — étiquettes en rouleau BOPP. */
const ROULEAU = [
  [
    {
      name: 'shape',
      label: 'shape',
      option_id: 3,
      html_type: 'radio',
      opt_sort_order: 0,
      opt_val_id: 1,
      option_val: 'circle',
      img_src: '/media/images/circle-label-icon.png',
      opt_val_sort_order: 0,
      extra_turnaround_days: 0,
    },
  ],
  [{ product_id: 7028, size_id: null, qty: null }],
  [{ product_id: 7028, content_type: 'best_uses', content: '…' }],
];

describe('reconnaît les deux formes réelles', () => {
  it('la forme standard', () => {
    expect(detecterFormeProduit(STANDARD)).toBe('standard');
  });

  it('la forme étiquette en rouleau', () => {
    expect(detecterFormeProduit(ROULEAU)).toBe('rouleau');
  });
});

describe('ne plante jamais — un garde qui plante ne garde rien', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['objet', { options: [] }],
    ['tableau vide', []],
    ['premier élément non tableau', ['x']],
    ['tableau de scalaires', [[1, 2, 3]]],
    ['chaîne', 'oops'],
  ])('%s → inconnue', (_nom, entree) => {
    expect(detecterFormeProduit(entree)).toBe('inconnue');
  });
});

describe("l'erreur distingue le permanent du passager", () => {
  it('porte l’id et la forme', () => {
    const e = new FormeProduitNonSupportee(7028, 'rouleau');
    expect(e.productId).toBe(7028);
    expect(e.forme).toBe('rouleau');
    expect(e).toBeInstanceOf(Error);
  });

  it('dit quoi faire, pas seulement que ça a échoué', () => {
    // Le message remplacé disait « service temporairement indisponible, notre
    // équipe a été notifiée » : trois affirmations fausses pour une panne
    // structurelle et permanente. Une erreur doit nommer la sortie.
    const m = new FormeProduitNonSupportee(7028, 'rouleau').message;
    expect(m).toContain('7028');
    expect(m).toMatch(/disabled|devis/i);
    expect(m).not.toMatch(/temporair/i);
  });
});
