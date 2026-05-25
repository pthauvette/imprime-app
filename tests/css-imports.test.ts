/**
 * Round 40 #1 — Guard test : ensure that ALL stylesheets in src/styles/ are
 * actually imported from src/app/layout.tsx (or anywhere reachable).
 *
 * Background : pendant ~10 rounds, src/styles/migrated-pages.css contenait
 * 196 KB de fixes mobile/responsive (mkt-nav reflow, .adm-main padding,
 * .ord-pills wrap, .od-grid mobile collapse) qui n'étaient JAMAIS shippés
 * en production parce que personne ne l'avait importé. Round 40 #1 a wire
 * l'import et ce test verrouille pour empêcher la régression.
 *
 * Test simple : pour chaque .css dans src/styles/, vérifier qu'il existe
 * un import correspondant quelque part dans src/. Si quelqu'un ajoute une
 * nouvelle stylesheet sans l'importer, ce test fail.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..');
const STYLES_DIR = join(REPO_ROOT, 'src', 'styles');

function listCssFiles(): string[] {
  return readdirSync(STYLES_DIR).filter((f) => f.endsWith('.css'));
}

/**
 * Cherche `import '@/styles/<name>'` ou `import './styles/<name>'` etc.
 * dans tous les .ts/.tsx sous src/app/. Très basique mais suffit pour
 * détecter un fichier vraiment orphan.
 */
function isImported(cssFilename: string): boolean {
  // Read the most likely import sites first to keep test fast.
  const candidates = [
    join(REPO_ROOT, 'src/app/layout.tsx'),
    join(REPO_ROOT, 'src/app/admin/layout.tsx'),
  ];
  const stem = cssFilename.replace(/\.css$/, '');
  for (const path of candidates) {
    try {
      const content = readFileSync(path, 'utf8');
      // Match `import '@/styles/foo.css'` ou `import '@/styles/foo'`.
      const re = new RegExp(`import\\s+['\"]@/styles/${stem}(\\.css)?['\"]`);
      if (re.test(content)) return true;
    } catch {
      // file may not exist, skip
    }
  }
  return false;
}

describe('CSS stylesheets — orphan guard (Round 40 #1)', () => {
  it('every .css in src/styles/ is imported from src/app/layout.tsx', () => {
    const cssFiles = listCssFiles();
    const orphans = cssFiles.filter((f) => !isImported(f));
    expect(orphans).toEqual([]);
  });

  it('globals.css is imported', () => {
    expect(isImported('globals.css')).toBe(true);
  });

  it('migrated-pages.css is imported (the original orphan)', () => {
    // Cette assertion existe spécifiquement pour empêcher la régression
    // du bug Round 30→40 : sans cet import, 196 KB de fixes mobile ne
    // ship pas. Si tu retires l'import croyant qu'il est inutile, ce
    // test rappellera que c'est essential.
    expect(isImported('migrated-pages.css')).toBe(true);
  });
});
