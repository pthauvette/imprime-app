/**
 * Sauvegarde de configuration mise en attente pendant la connexion.
 *
 * Les tests visent ce qui doit être IMPOSSIBLE : rejouer une intention
 * périmée, rejouer sur le mauvais produit, poster une entrée corrompue, ou
 * renvoyer le client sur une configuration qui n'est pas la sienne.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mettreEnAttente,
  lireEnAttente,
  viderEnAttente,
  urlDeRetour,
} from '@/lib/wizard/pending-save';

const CLE = 'plio.saveConfig.pending.v1';
const T0 = 1_700_000_000_000;

const ENTREE = {
  name: 'Flyer campagne',
  productId: 37,
  productName: 'Flyer 100lb',
  optionIds: [12, 18, 35, 80, 92, 93],
  summary: '500 × 8.5 x 5.5',
};

/** localStorage minimal — l'environnement vitest est `node`. */
beforeEach(() => {
  const magasin = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => magasin.get(k) ?? null,
    setItem: (k: string, v: string) => { magasin.set(k, v); },
    removeItem: (k: string) => { magasin.delete(k); },
    clear: () => magasin.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('pending-save', () => {
  it('rend l’intention mise en attente pour le bon produit', () => {
    mettreEnAttente(ENTREE, T0);
    expect(lireEnAttente(37, T0 + 1000)).toMatchObject(ENTREE);
  });

  it('ne rend RIEN pour un autre produit', () => {
    // Sinon on sauvegarderait la config du produit A sous le produit B.
    mettreEnAttente(ENTREE, T0);
    expect(lireEnAttente(99, T0 + 1000)).toBeNull();
  });

  it('ne rejoue PAS une intention de plus de 30 minutes', () => {
    // Une intention oubliée ne doit pas resurgir dans le compte du client.
    mettreEnAttente(ENTREE, T0);
    expect(lireEnAttente(37, T0 + 29 * 60_000)).not.toBeNull();
    expect(lireEnAttente(37, T0 + 31 * 60_000)).toBeNull();
  });

  it('ignore une entrée corrompue plutôt que de la poster', () => {
    for (const brut of ['pas du json', '{}', '[]', 'null',
      JSON.stringify({ ...ENTREE, at: T0, optionIds: ['12'] }),
      JSON.stringify({ ...ENTREE, at: T0, name: '   ' }),
      JSON.stringify({ ...ENTREE, at: T0, productId: 'trente-sept' })]) {
      localStorage.setItem(CLE, brut);
      expect(lireEnAttente(37, T0)).toBeNull();
    }
  });

  it('garde une seule intention — la dernière l’emporte', () => {
    mettreEnAttente(ENTREE, T0);
    mettreEnAttente({ ...ENTREE, name: 'Deuxième' }, T0 + 10);
    expect(lireEnAttente(37, T0 + 20)?.name).toBe('Deuxième');
  });

  it('viderEnAttente efface bien', () => {
    mettreEnAttente(ENTREE, T0);
    viderEnAttente();
    expect(lireEnAttente(37, T0)).toBeNull();
  });

  it('ne jette pas quand le stockage est indisponible (navigation privée)', () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    } as unknown as Storage;
    expect(() => mettreEnAttente(ENTREE, T0)).not.toThrow();
    expect(lireEnAttente(37, T0)).toBeNull();
    expect(() => viderEnAttente()).not.toThrow();
  });
});

describe('urlDeRetour', () => {
  it('transporte les options — sans elles le client revient sur les défauts', () => {
    // Le vrai défaut du parcours : le callbackUrl ne portait que le productId,
    // donc même en rejouant la sauvegarde, l'écran montrait autre chose.
    const u = urlDeRetour('/order/configure', '?productId=37', 37, [12, 35, 92]);
    expect(u).toContain('options=12%2C35%2C92');
    expect(u).toContain('productId=37');
  });

  it('n’écrit pas de paramètre `options` vide', () => {
    expect(urlDeRetour('/order/configure', '', 37, [])).not.toContain('options=');
  });

  it('préserve les autres paramètres (designId, files…)', () => {
    const u = urlDeRetour('/order/configure', '?productId=37&designId=abc', 37, [12]);
    expect(u).toContain('designId=abc');
  });
});
