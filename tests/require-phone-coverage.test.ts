/**
 * Toute surface de compte applique le garde « téléphone vérifié ».
 *
 * POURQUOI CE FICHIER. La politique « téléphone obligatoire » a été décidée en
 * 2026-08 et implémentée dans `lib/auth/require-phone.ts`… puis appelée à UN
 * seul endroit, `orders/page.tsx`. Elle ne couvrait donc ni `/orders/[id]` ni
 * les huit autres préfixes protégés : un client pouvait s'inscrire et utiliser
 * son portefeuille, ses paiements, ses adresses et son parrainage sans jamais
 * croiser l'étape de vérification.
 *
 * C'est le motif qui revient sans cesse dans ce dépôt : la couche existe, elle
 * n'est pas branchée partout. Un test qui se contenterait de vérifier que
 * `exigerTelephoneVerifie` fonctionne n'aurait rien vu — elle fonctionnait.
 *
 * Ce test lit donc la LISTE FAISANT AUTORITÉ (`PROTECTED_PREFIXES` dans
 * `middleware.ts`) et exige un garde pour chacun. Ajouter demain une surface de
 * compte sans garde casse la CI, sans que personne ait à se souvenir de ce
 * fichier.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RACINE = join(__dirname, '..');

/**
 * Exemptions DÉLIBÉRÉES. Chacune est une porte de sortie : la retirer de cette
 * liste enfermerait dehors un compte sans numéro vérifié, sans lui laisser le
 * moindre moyen d'en poser un.
 */
const EXEMPTS: Record<string, string> = {
  '/onboarding': "c'est la page où l'on vérifie son numéro",
  '/settings':
    'héberge le panneau de vérification de SECOURS — le garder couperait la ' +
    "seule porte de sortie si le parcours d'onboarding échoue",
};

function prefixesProteges(): string[] {
  const src = readFileSync(join(RACINE, 'src', 'middleware.ts'), 'utf8');
  const bloc = src.match(/const PROTECTED_PREFIXES\s*=\s*\[([\s\S]*?)\]/);
  expect(bloc, 'PROTECTED_PREFIXES introuvable dans middleware.ts').toBeTruthy();
  return [...bloc![1]!.matchAll(/'(\/[^']+)'/g)].map((m) => m[1]!);
}

describe('le garde téléphone couvre toutes les surfaces de compte', () => {
  const prefixes = prefixesProteges();

  it('la liste est bien lue depuis le middleware', () => {
    // Si le parsing casse silencieusement, le test passerait sur une liste vide
    // et n'aurait plus aucune valeur.
    expect(prefixes.length).toBeGreaterThanOrEqual(9);
    expect(prefixes).toContain('/orders');
  });

  it.each(prefixesProteges().filter((p) => !(p in EXEMPTS)))(
    '%s a un layout qui appelle exigerTelephoneVerifie',
    (prefixe) => {
      const layout = join(RACINE, 'src', 'app', prefixe.slice(1), 'layout.tsx');
      expect(existsSync(layout), `${prefixe} : layout.tsx manquant`).toBe(true);
      expect(readFileSync(layout, 'utf8')).toContain('exigerTelephoneVerifie');
    },
  );

  it.each(Object.entries(EXEMPTS))('%s reste exempté — %s', (prefixe) => {
    const layout = join(RACINE, 'src', 'app', prefixe.slice(1), 'layout.tsx');
    if (!existsSync(layout)) return;
    // Un layout peut exister pour d'autres raisons ; il ne doit juste pas
    // porter le garde.
    expect(readFileSync(layout, 'utf8')).not.toContain('exigerTelephoneVerifie');
  });
});

describe('le garde reste inerte tant que le SMS n’est pas configuré', () => {
  // Propriété de sûreté la plus importante du fichier gardé : sans ce repli,
  // ces neuf layouts enfermeraient dehors TOUS les comptes existants — aucun
  // n'a de `phoneVerified`. On vérifie que le repli n'a pas été retiré au
  // passage, maintenant qu'il protège neuf surfaces au lieu d'une.
  const src = readFileSync(join(RACINE, 'src', 'lib', 'auth', 'require-phone.ts'), 'utf8');

  it('sort immédiatement si smsAuthDisponible() est faux', () => {
    expect(src).toMatch(/if\s*\(\s*!smsAuthDisponible\(\)\s*\)\s*return\s*;/);
  });

  it('ne redirige jamais un visiteur anonyme vers la vérification', () => {
    // Sinon un anonyme partirait vers /onboarding au lieu de /sign-in.
    expect(src).toMatch(/if\s*\(\s*!userId\s*\)\s*return\s*;/);
  });
});
