/**
 * Tranche de l'index envoyée au navigateur.
 *
 * Ce qui est verrouillé ici, c'est une BORNE : la charge de la page du tunnel
 * d'achat ne doit plus dépendre de la taille de la matrice Sinalite (jusqu'à
 * 90 520 variantes, ~1,9 Mo). Et la tranche doit couvrir exactement ce dont le
 * configurateur a besoin pour rester instantané — ni plus, ni moins.
 */
import { describe, it, expect } from 'vitest';
import { buildVariantSlice } from '@/lib/products/variant-slice';
import type { SinaliteOption } from '@/lib/sinalite/types';

const GROUPES: Record<string, SinaliteOption[]> = {
  size: [
    { id: 1, group: 'size', name: '8.5 x 5.5' },
    { id: 2, group: 'size', name: '8.5 x 11' },
  ],
  Stock: [
    { id: 10, group: 'Stock', name: '1 Side (4/0)' },
    { id: 11, group: 'Stock', name: '2 Sides (4/4)' },
  ],
  qty: [
    { id: 100, group: 'qty', name: '250' },
    { id: 101, group: 'qty', name: '500' },
  ],
};

const SELECTION = { size: 1, Stock: 11, qty: 101 };

/** Index COMPLET des 2×2×2 combinaisons + du bruit hors voisinage. */
function indexComplet(): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of [1, 2]) for (const st of [10, 11]) for (const q of [100, 101]) {
    m.set([s, st, q].sort((a, b) => a - b).join('-'), s * 100 + st + q / 100);
  }
  m.set('999-998-997', 42); // combinaison sans rapport : ne doit PAS être servie
  return m;
}

describe('buildVariantSlice', () => {
  const tranche = buildVariantSlice(GROUPES, SELECTION, indexComplet());

  it('couvre la sélection courante à CHAQUE palier de quantité', () => {
    // C'est ce qui rend le curseur de quantité instantané.
    expect(tranche['1-11-100']).toBeDefined();
    expect(tranche['1-11-101']).toBeDefined();
  });

  it('couvre les variantes à UNE option près, à chaque palier', () => {
    // Les deltas par option — et surtout : après un clic, la nouvelle
    // sélection est déjà là, donc le curseur reste instantané.
    expect(tranche['2-11-101']).toBeDefined(); // autre format
    expect(tranche['1-10-101']).toBeDefined(); // autre face
    expect(tranche['2-11-100']).toBeDefined();
  });

  it('n’embarque AUCUNE combinaison hors voisinage', () => {
    expect(tranche['999-998-997']).toBeUndefined();
  });

  it('omet les clés absentes de l’index plutôt que d’inventer un prix', () => {
    const creux = new Map([['1-11-101', 50]]);
    const t = buildVariantSlice(GROUPES, SELECTION, creux);
    expect(Object.keys(t)).toEqual(['1-11-101']);
  });

  it('reste borné quand la matrice explose — la taille suit les OPTIONS, pas la matrice', () => {
    // 40 formats × 40 paliers = 1600 combinaisons dans l'index ; la tranche
    // ne doit en garder que le voisinage (40 formats × 40 paliers ici, mais
    // JAMAIS le produit cartésien complet avec les autres groupes).
    const gros: Record<string, SinaliteOption[]> = {
      size: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, group: 'size', name: `f${i}` })),
      Stock: Array.from({ length: 10 }, (_, i) => ({ id: 200 + i, group: 'Stock', name: `s${i}` })),
      qty: Array.from({ length: 40 }, (_, i) => ({ id: 500 + i, group: 'qty', name: String((i + 1) * 100) })),
    };
    const plein = new Map<string, number>();
    for (const s of gros.size) for (const st of gros.Stock) for (const q of gros.qty) {
      plein.set([s.id, st.id, q.id].sort((a, b) => a - b).join('-'), 1);
    }
    expect(plein.size).toBe(16_000);
    const t = buildVariantSlice(gros, { size: 1, Stock: 200, qty: 500 }, plein);
    // Voisinage = (1 + 39 + 9) combinaisons × 40 paliers = 1960
    expect(Object.keys(t).length).toBe(1960);
    expect(Object.keys(t).length).toBeLessThan(plein.size / 8);
  });

  it('renvoie une tranche VIDE si un groupe n’a pas de sélection', () => {
    // Mieux vaut tout déléguer au repli distant qu'une tranche trompeuse.
    expect(buildVariantSlice(GROUPES, { size: 1, qty: 101 }, indexComplet())).toEqual({});
  });
});
