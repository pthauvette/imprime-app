/**
 * Un premier plan FIGÉ ne doit jamais se poser sur un fond PILOTÉ PAR JETON.
 *
 * POURQUOI CE FICHIER (audit thème sombre, 2026-08). #568 a rendu le thème
 * sombre atteignable par TOUT visiteur dont l'OS est en sombre. Le lendemain,
 * `measure-a11y.mjs` en THEME=dark trouvait 16 problèmes de contraste pour 0 en
 * clair. La cause était unique et mécanique :
 *
 *     background: var(--accent-primary)   ← bascule avec le thème
 *     color: '#fff'                       ← ne bascule pas
 *
 * En clair `--accent-primary` est un vert FONCÉ : le blanc dessus est parfait.
 * En sombre il devient un vert CLAIR, et le même blanc tombe à 2,60:1.
 *
 * ⚠️ CE QUE CE TEST APPORTE QUE LE SCANNER NE PEUT PAS. `measure-a11y.mjs`
 * mesure le rendu réel — c'est la vérité — mais seulement sur les ~25 routes
 * de sa liste. Il n'a signalé qu'UN des 22 sites fautifs ; les 21 autres
 * vivaient dans l'admin, le compte, les états d'erreur et un second bouton de
 * la même page. Le scanner écrit exprès pour ça en #566 avait déjà eu ce défaut
 * (#571) : un détecteur ne vaut que ce que couvre sa liste de routes.
 *
 * Ce test-ci ne mesure rien — il n'a aucune idée du contraste obtenu. Il
 * interdit une CONSTRUCTION, sur tout le dépôt, y compris le code qu'aucun
 * navigateur n'a jamais chargé. Les deux sont nécessaires.
 *
 * Le remplaçant est toujours le même : `var(--text-on-accent)`, dont c'est
 * exactement le rôle, et sa variante `--text-on-accent-soft` pour un texte
 * volontairement plus discret sur le même fond.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(__dirname, '..', 'src');

/** Couleurs écrites en dur — celles qui NE basculeront jamais. */
const FIGE = /color:\s*['"]?(#fff\b|#ffffff\b|white\b|#000\b|#000000\b|black\b)['"]?/i;

/** Fonds qui, eux, changent de clarté d'un thème à l'autre. */
const FOND_QUI_BASCULE =
  /background(?:-color)?:\s*['"]?var\(--(accent-primary|accent-hover|accent-pressed)\)/;

function fichiers(dir: string, ext: readonly string[]): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dir)) {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin, ext));
    else if (ext.some((e) => nom.endsWith(e))) out.push(chemin);
  }
  return out;
}

/**
 * Un objet de style JSX s'étale sur plusieurs lignes : il faut donc regarder
 * autour de chaque `color:` figé. Mais la fenêtre s'arrête à toute accolade
 * FERMANTE — sinon on déborde sur la règle voisine.
 *
 * Ce n'est pas théorique : la première version signalait
 * `.adm-wh-source.stripe { background: #635BFF; color: white; }`, dont le fond
 * est le violet de marque Stripe écrit EN DUR. Blanc sur violet fixe est
 * parfaitement correct — les deux sont figés, ils ne peuvent pas se désaccorder.
 * C'est le MÉLANGE figé + jeton qui casse, pas le figé.
 *
 * Un faux positif coûte plus cher qu'un faux négatif ici : il ferait désactiver
 * le test, alors qu'un manque sera rattrapé par `measure-a11y.mjs` sur les
 * routes publiques.
 */
function fautes(source: string): string[] {
  const lignes = source.split('\n');
  const trouvees: string[] = [];
  for (let i = 0; i < lignes.length; i++) {
    if (!FIGE.test(lignes[i]!)) continue;

    const bloc = [lignes[i]!];
    for (let h = i - 1; h >= 0 && i - h <= 5; h--) {
      if (lignes[h]!.includes('}')) break;
      bloc.unshift(lignes[h]!);
    }
    for (let b = i + 1; b < lignes.length && b - i <= 5; b++) {
      if (lignes[b]!.includes('}')) break;
      bloc.push(lignes[b]!);
    }

    if (FOND_QUI_BASCULE.test(bloc.join('\n'))) trouvees.push(`L${i + 1}: ${lignes[i]!.trim()}`);
  }
  return trouvees;
}

describe('le test se déclenche vraiment', () => {
  // Un garde qu'on n'a jamais vu détecter est un feu vert décoratif.
  it('reconnaît la construction exacte qui a fui en production', () => {
    expect(
      fautes(`
        style={{
          background: 'var(--accent-primary)',
          color: '#fff',
        }}
      `),
    ).toHaveLength(1);
    expect(fautes('.checkbox {\n background: var(--accent-primary);\n color: white;\n}')).toHaveLength(1);
  });

  it('ne crie PAS sur du blanc posé sur un fond lui aussi figé', () => {
    // Régression du premier jet : `.adm-wh-source.stripe` a un fond de marque
    // Stripe en dur. Deux valeurs figées ne peuvent pas se désaccorder — la
    // fenêtre débordait simplement sur la règle voisine.
    expect(fautes('.adm-wh-source.stripe { background: #635BFF; color: white; }')).toEqual([]);
  });

  it('laisse passer le correctif', () => {
    expect(
      fautes(`
        style={{
          background: 'var(--accent-primary)',
          color: 'var(--text-on-accent)',
        }}
      `),
    ).toEqual([]);
  });

  it('ne crie pas sur du blanc posé sur un fond qui ne bascule pas', () => {
    // `--paper-warm` et les `--ink-*` sont des jetons d'IMPRIMÉ SIMULÉ : ils
    // restent clairs dans les deux thèmes, à dessein (une carte de visite ne
    // devient pas noire parce que l'OS est en sombre).
    expect(fautes("background: 'var(--paper-warm)',\ncolor: '#000',")).toEqual([]);
  });
});

describe('aucun premier plan figé sur un fond piloté par jeton', () => {
  it('dans les composants TSX', () => {
    const problemes = fichiers(RACINE, ['.tsx'])
      .map((f) => ({ f, faute: fautes(readFileSync(f, 'utf8')) }))
      .filter((r) => r.faute.length > 0)
      .map((r) => `${r.f.replace(RACINE, 'src')}\n    ${r.faute.join('\n    ')}`);

    expect(problemes, `Remplace par var(--text-on-accent) :\n  ${problemes.join('\n  ')}`).toEqual([]);
  });

  it('dans les feuilles de style', () => {
    const problemes = fichiers(join(RACINE, 'styles'), ['.css'])
      .map((f) => ({ f, faute: fautes(readFileSync(f, 'utf8')) }))
      .filter((r) => r.faute.length > 0)
      .map((r) => `${r.f.replace(RACINE, 'src')}\n    ${r.faute.join('\n    ')}`);

    expect(problemes, `Remplace par var(--text-on-accent) :\n  ${problemes.join('\n  ')}`).toEqual([]);
  });
});

describe('les jetons de thème existent dans les DEUX thèmes', () => {
  const css = readFileSync(join(RACINE, 'styles', 'globals.css'), 'utf8');

  // Un jeton défini uniquement en clair ne « tombe » pas : il garde sa valeur
  // claire en sombre — le bug est alors invisible en relecture de diff.
  it.each(['--text-on-accent', '--text-on-accent-soft', '--ink-strong', '--ink-soft'])(
    '%s est déclaré',
    (jeton) => {
      expect(css).toContain(`${jeton}:`);
    },
  );

  it('--text-on-accent-soft a bien une valeur distincte par thème', () => {
    const valeurs = new Set(
      [...css.matchAll(/--text-on-accent-soft:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]!.toUpperCase()),
    );
    expect(valeurs.size).toBeGreaterThanOrEqual(2);
  });

  it('--ink-* NE bascule PAS — c’est le contraire, et c’est voulu', () => {
    // Encre sur papier simulé : une seule valeur, partagée par les deux thèmes.
    // Si un jour quelqu’un les « corrige » en les faisant basculer, les cartes
    // de visite de l’accueil redeviendront illisibles (1,16:1).
    const strong = new Set([...css.matchAll(/--ink-strong:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1]!.toUpperCase()));
    expect(strong.size).toBe(1);
  });
});
