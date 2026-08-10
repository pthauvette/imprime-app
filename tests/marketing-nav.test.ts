/**
 * La barre marketing n'a qu'UNE liste de liens, quelle que soit la largeur.
 *
 * POURQUOI CE FICHIER. Ce dépôt a déjà payé deux fois le prix des listes de
 * navigation recopiées : chaque page marketing hand-codait son propre <nav>
 * avec un sous-ensemble différent (#537), puis quatre pages ratées gardaient
 * encore le leur (#559). Ajouter un rendu MOBILE, c'est rouvrir exactement ce
 * risque — un deuxième endroit où écrire des liens, qui divergera.
 *
 * `MarketingMobileMenu` reçoit donc `NAV_ITEMS` en props. Ce test vérifie qu'il
 * ne s'est pas remis à en tenir une copie.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const entete = readFileSync(join(SRC, 'components', 'marketing', 'MarketingHeader.tsx'), 'utf8');
const menu = readFileSync(join(SRC, 'components', 'marketing', 'MarketingMobileMenu.tsx'), 'utf8');
const css = readFileSync(join(SRC, 'styles', 'globals.css'), 'utf8');

const LIBELLES = ['Produits', 'Tarifs', 'Blog', 'À propos', 'Aide', 'Contact'];

describe('une seule liste de liens', () => {
  it('MarketingHeader la déclare', () => {
    for (const l of LIBELLES) expect(entete).toContain(`'${l}'`);
  });

  it.each(LIBELLES)('le menu mobile ne recopie pas « %s »', (libelle) => {
    expect(menu).not.toContain(`'${libelle}'`);
    expect(menu).not.toContain(`>${libelle}<`);
  });

  it('le menu mobile reçoit bien la liste en props', () => {
    expect(entete).toMatch(/<MarketingMobileMenu[\s\S]*items=\{NAV_ITEMS\}/);
    expect(menu).toMatch(/items\.map/);
  });
});

describe("le CTA reste hors du repli — c'est l'action de conversion", () => {
  it('le rendu mobile porte son propre CTA, hors du panneau', () => {
    // Si un jour « Commander → » migre DANS MarketingMobileMenu, c'est qu'on
    // l'a caché derrière un tap. Décision explicite à reprendre, pas un
    // glissement silencieux.
    expect(entete).toMatch(/mkt-nav-mobile[\s\S]*mkt-nav-cta/);
    expect(menu).not.toContain('mkt-nav-cta');
  });
});

describe('le bouton du menu reste atteignable au pouce', () => {
  it('44px NON rétrécissables', () => {
    // Mesuré : avec `width: 44px` seul, le bouton tombait à 24×44 une fois
    // OUVERT — comme tout item de flex il est rétrécissable par défaut. Or
    // c'est précisément la cible qu'il faut atteindre pour refermer.
    const bloc = css.match(/\.mkt-burger\s*\{[^}]*\}/);
    expect(bloc, '.mkt-burger introuvable').toBeTruthy();
    expect(bloc![0]).toMatch(/flex:\s*0\s+0\s+44px/);
  });

  it('les liens du panneau visent 48px', () => {
    const bloc = css.match(/\.mkt-menu-link\s*\{[^}]*\}/);
    expect(bloc![0]).toMatch(/min-height:\s*48px/);
  });
});

describe('accessibilité du repli', () => {
  it('le bouton annonce son état et ce qu’il contrôle', () => {
    expect(menu).toContain('aria-expanded');
    expect(menu).toContain('aria-controls');
  });

  it('Échap referme ET rend le focus au bouton', () => {
    // Sans le retour de focus, celui-ci repart au début du document.
    expect(menu).toContain("'Escape'");
    expect(menu).toMatch(/boutonRef\.current\?\.focus\(\)/);
  });

  it('le panneau se referme après navigation', () => {
    // Sinon il reste ouvert par-dessus la page demandée et l'utilisateur
    // croit que son tap n'a rien fait.
    expect(menu).toMatch(/usePathname/);
  });
});
