/**
 * Le nom produit servi au client ne doit JAMAIS être le nom fournisseur brut.
 *
 * POURQUOI CE FICHIER. `/api/products/[id]` renvoyait le résultat direct de
 * `sinalite.getProduct()` — donc « Business cards 14pt (Profit Maximizer) »,
 * « … (High Gloss) », « … (C1S) » : des noms de PALIERS DE MARGE et des codes
 * d'atelier. Rien ne fuyait encore : les seuls appelants lisaient `category`.
 * C'était un canal DORMANT.
 *
 * Ce dépôt a déjà laissé cette fuite atteindre la production DEUX fois — sur
 * /order/configure (#540), puis sur /compare (#563) — les deux fois parce que
 * la couche de noms marketing existait sans être branchée partout. En ajoutant
 * le nom du produit aux étapes fichiers et livraison, on transformait ce canal
 * dormant en troisième occurrence. D'où l'application des overrides À LA
 * SOURCE, et ce test pour qu'elle y reste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — module .mjs de scripts/, hors du graphe TS de src/
import { analyser } from '../scripts/lib/supplier-leak.mjs';

const SRC = join(__dirname, '..', 'src');
/**
 * ⚠️ On retire les COMMENTAIRES avant d'asserter. Premier jet : les deux
 * assertions « ne doit pas contenir » échouaient sur la documentation du hook,
 * qui cite `sinalite.getProduct` et « Produit #97 » précisément pour dire qu'il
 * ne faut PAS les employer. Un test qui grep du source ne distingue pas le code
 * de la prose — sans ce nettoyage, documenter un piège déclenche le garde censé
 * l'empêcher, et la règle punit exactement la bonne pratique qu'elle encourage.
 */
const sansCommentaires = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const lire = (...p: string[]) => sansCommentaires(readFileSync(join(SRC, ...p), 'utf8'));

const route = lire('app', 'api', 'products', '[id]', 'route.ts');
const hook = lire('hooks', 'useProductIdentity.ts');
const shipping = lire('app', 'order', 'shipping', 'page.tsx');

describe("l'API applique les noms marketing à la source", () => {
  it('passe le produit brut par applyProductOverrides', () => {
    expect(route).toContain('applyProductOverrides');
    expect(route).toMatch(/applyProductOverrides\(\[\s*brut\s*\]\)/);
  });

  it('ne sert jamais le produit brut sous le nom `product`', () => {
    // `product: brut` seul serait la régression exacte. Le repli `?? brut` est
    // volontaire : si la DB est injoignable, `applyProductOverrides` retourne
    // déjà les produits tels quels et le catalogue continue de fonctionner —
    // mieux vaut un nom brut qu'une page morte.
    expect(route).not.toMatch(/\bproduct:\s*brut\s*,/);
    expect(route).toMatch(/product:\s*product\s*\?\?\s*brut/);
  });
});

describe('le hook des étapes du tunnel lit la BONNE source', () => {
  it('passe par /api/products/[id], jamais par le client Sinalite', () => {
    expect(hook).toMatch(/\/api\/products\//);
    expect(hook).not.toContain('sinalite');
  });

  it("n'affiche rien tant que le nom est inconnu", () => {
    expect(hook).toMatch(/nom:\s*string\s*\|\s*null/);
  });

  it("l'étape livraison ne rend plus d'identifiant interne", () => {
    // Elle montrait « Produit #97 » au dernier écran avant le paiement.
    // L'invariant porte sur la PAGE, pas sur le hook.
    expect(shipping).not.toMatch(/Produit\s*#\{/);
    expect(shipping).toContain('useProductIdentity');
  });
});

describe("le détecteur reconnaît ce qu'on cherche à empêcher", () => {
  it('signalerait les noms fournisseur si jamais ils revenaient', () => {
    // Un garde qu'on n'a jamais vu détecter est un feu vert décoratif.
    expect(analyser('Business cards 14pt (Profit Maximizer)')).not.toEqual([]);
    expect(analyser('Business Cards 14pt + UV (High Gloss)')).not.toEqual([]);
  });

  it('laisse passer le nom marketing réellement rendu aujourd’hui', () => {
    // Chaîne relevée dans le rendu des deux étapes après correctif.
    expect(analyser('Carte de visite — 14pt, Standard (sans couche)')).toEqual([]);
  });
});
