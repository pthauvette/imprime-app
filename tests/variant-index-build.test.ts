/**
 * Construction de l'index de variantes — pagination et garde-fous.
 *
 * Ce fichier existe à cause d'une panne SILENCIEUSE de plusieurs mois :
 * `listVariants` passait l'offset dans la case du `storeCode`, Sinalite
 * retombait sur le magasin par défaut et resservait la page 0 — HTTP 200,
 * 1000 lignes, aucune erreur. La boucle tournait 50 fois pour rien et l'index
 * plafonnait à 1000 entrées (5 % du produit 37). Le seul symptôme était un
 * « prix indisponible » ailleurs dans l'app, des semaines plus tard.
 *
 * Les tests visent donc la DÉTECTION, pas le chemin heureux.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listVariants = vi.fn();
const erreurs: unknown[][] = [];
const avertissements: unknown[][] = [];

vi.mock('@/lib/sinalite/client', () => ({
  sinalite: { listVariants: (...a: unknown[]) => listVariants(...a) },
}));
vi.mock('@/lib/logger', () => ({
  log: {
    error: (...a: unknown[]) => { erreurs.push(a); },
    warn: (...a: unknown[]) => { avertissements.push(a); },
    info: vi.fn(),
  },
}));

const { getVariantIndex, invalidateVariantCache } = await import('@/lib/sinalite/pricing');

/** Page de `n` variantes dont les clés démarrent à `depart`. */
function page(depart: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({ key: `${depart + i}-1-2`, price: 10 + i }));
}

beforeEach(() => {
  listVariants.mockReset();
  erreurs.length = 0;
  avertissements.length = 0;
  invalidateVariantCache();
});

describe('getVariantIndex', () => {
  it('pagine jusqu’à la dernière page (partielle) et s’arrête là', async () => {
    listVariants
      .mockResolvedValueOnce(page(0, 1000))
      .mockResolvedValueOnce(page(1000, 1000))
      .mockResolvedValueOnce(page(2000, 250));
    const r = await getVariantIndex(1);
    expect(r.index.size).toBe(2250);
    expect(listVariants).toHaveBeenCalledTimes(3);
    // Index complet → aucun avertissement de troncature.
    expect(avertissements).toHaveLength(0);
  });

  it('demande les offsets 0, 1000, 2000 — pas toujours le même', async () => {
    listVariants
      .mockResolvedValueOnce(page(0, 1000))
      .mockResolvedValueOnce(page(1000, 1000))
      .mockResolvedValueOnce(page(2000, 10));
    await getVariantIndex(1);
    expect(listVariants.mock.calls.map((c) => c[1])).toEqual([0, 1000, 2000]);
  });

  it('S’ARRÊTE et journalise en erreur si l’API resert la même page', async () => {
    // LE test de ce fichier : c'est exactement ce que faisait Sinalite. Sans ce
    // garde, la boucle tournait 50 fois en silence.
    listVariants.mockResolvedValue(page(0, 1000));
    const r = await getVariantIndex(1);
    expect(r.index.size).toBe(1000);
    expect(listVariants).toHaveBeenCalledTimes(2); // la 1re, puis la répétition détectée
    expect(erreurs).toHaveLength(1);
    expect(String(erreurs[0][1])).toContain('TRONQUÉ');
  });

  it('journalise un index PARTIEL — sinon il se confond avec « pas de prix »', async () => {
    listVariants.mockResolvedValue(page(0, 1000));
    await getVariantIndex(1);
    expect(avertissements).toHaveLength(1);
    expect(String(avertissements[0][1])).toContain('PARTIEL');
  });

  it('sert le cache au second appel, sans retoucher à l’API', async () => {
    listVariants.mockResolvedValueOnce(page(0, 5));
    await getVariantIndex(7);
    listVariants.mockClear();
    const r = await getVariantIndex(7);
    expect(r.fromCache).toBe(true);
    expect(listVariants).not.toHaveBeenCalled();
  });
});
