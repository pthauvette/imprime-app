/**
 * Parité des deux blocs de jetons sombres.
 *
 * POURQUOI CE TEST EXISTE. Le thème sombre doit être déclaré DEUX fois :
 *   - `[data-theme="dark"]` — le choix explicite du client ;
 *   - `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` — sa
 *     préférence système, quand il n'a rien choisi.
 * CSS ne permet pas de partager un bloc entre un sélecteur et une media query
 * sans préprocesseur. La duplication est donc subie, pas choisie.
 *
 * Or la duplication est LE défaut qui a coûté le plus cher dans ce dépôt cette
 * session : trois dictionnaires de libellés divergents, cinq barres de
 * navigation, un devis MCP désynchronisé du checkout. À chaque fois la copie
 * était justifiée à l'écrit, et à chaque fois elle a dérivé sans rien casser.
 *
 * Ici la dérive serait particulièrement sournoise : elle ne se verrait QUE chez
 * les visiteurs en préférence système — c'est-à-dire jamais chez celui qui a
 * cliqué le bouton pour tester.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CSS = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');

/** Jetons déclarés dans le bloc qui SUIT la première occurrence de `ancre`. */
function jetonsApres(ancre: string): Record<string, string> {
  const at = CSS.indexOf(ancre);
  if (at < 0) throw new Error(`ancre introuvable : ${ancre}`);
  const ouvre = CSS.indexOf('{', at);
  let prof = 0;
  let fin = -1;
  for (let i = ouvre; i < CSS.length; i++) {
    if (CSS[i] === '{') prof++;
    else if (CSS[i] === '}') { prof--; if (prof === 0) { fin = i; break; } }
  }
  const corps = CSS.slice(ouvre + 1, fin);
  const out: Record<string, string> = {};
  for (const m of corps.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]!] = m[2]!.trim().replace(/\s+/g, ' ');
  }
  return out;
}

describe('thème sombre — les deux déclarations restent identiques', () => {
  const explicite = jetonsApres('\n[data-theme="dark"] {');
  const systeme = jetonsApres('@media (prefers-color-scheme: dark)');

  it('déclarent le MÊME ensemble de jetons', () => {
    expect(Object.keys(systeme).sort()).toEqual(Object.keys(explicite).sort());
  });

  it('déclarent les MÊMES valeurs', () => {
    expect(systeme).toEqual(explicite);
  });

  it('couvrent un socle non trivial', () => {
    // Garde-fou contre un test qui passerait sur deux blocs vides.
    expect(Object.keys(explicite).length).toBeGreaterThan(30);
    for (const requis of ['--bg-canvas', '--text-primary', '--bg-surface', '--accent-primary']) {
      expect(explicite).toHaveProperty(requis);
    }
  });

  it('donnent une valeur sombre à TOUTES les ombres', () => {
    // Elles n'en avaient aucune : calibrées sur fond clair, elles étaient
    // invisibles sur #0F1411 et les cartes perdaient tout relief.
    for (const ombre of ['--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl', '--shadow-accent']) {
      expect(explicite, `${ombre} sans valeur sombre`).toHaveProperty(ombre);
    }
  });
});

describe('la préférence système ne écrase jamais un choix explicite', () => {
  it('le bloc média est bien restreint à `:root:not([data-theme])`', () => {
    const at = CSS.indexOf('@media (prefers-color-scheme: dark)');
    const extrait = CSS.slice(at, at + 200);
    expect(extrait).toContain(':root:not([data-theme])');
    // Un `:root` nu gagnerait sur `[data-theme="light"]` par ordre source
    // (même spécificité, déclaré plus loin) : un client ayant choisi le clair
    // se retrouverait en sombre sans comprendre pourquoi.
    expect(extrait).not.toMatch(/\{\s*:root\s*\{/);
  });
});
